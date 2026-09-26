import importlib
import sys

import pytest
from decouple import UndefinedValueError


def _reload_production():
    sys.modules.pop("config.settings.production", None)
    sys.modules.pop("config.settings.base", None)
    return importlib.import_module("config.settings.production")


def test_production_settings_refuse_to_start_without_a_secret_key(monkeypatch):
    """Production must fail loudly rather than boot on a default key.

    A settings module that quietly substitutes a fallback SECRET_KEY ships a
    known signing key to production, which forges every session and token it
    protects. Crashing at import is the safe failure.
    """
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(UndefinedValueError):
        _reload_production()


def test_local_settings_start_without_any_env_configured(monkeypatch):
    """Development has to work on a fresh clone with no .env.

    base.py has no SECRET_KEY fallback so production can't boot on a known
    key; local settings supply a throwaway one instead, or `manage.py` fails
    before it can do anything at all.
    """
    monkeypatch.delenv("SECRET_KEY", raising=False)

    sys.modules.pop("config.settings.local", None)
    sys.modules.pop("config.settings.base", None)
    module = importlib.import_module("config.settings.local")

    assert module.SECRET_KEY
    assert module.DEBUG is True


def test_local_settings_do_not_override_a_real_secret_key(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "a-developers-own-key")

    sys.modules.pop("config.settings.local", None)
    sys.modules.pop("config.settings.base", None)
    module = importlib.import_module("config.settings.local")

    assert module.SECRET_KEY == "a-developers-own-key"


def test_production_settings_refuse_to_start_without_a_database_url(monkeypatch):
    """No SQLite fallback in production.

    A container filesystem is ephemeral, so falling back would run the business
    on a database wiped by the next deploy — a failure nobody notices until the
    data is already gone. Refusing to boot surfaces it immediately.
    """
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-for-settings-import")
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(UndefinedValueError):
        _reload_production()


def test_production_settings_load_when_the_required_env_is_supplied(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-for-settings-import")
    monkeypatch.setenv("DATABASE_URL", "postgres://user:pw@db.example.com:5432/vantage")

    module = _reload_production()

    assert module.SECRET_KEY == "test-secret-key-for-settings-import"
    assert module.DEBUG is False
    assert module.DATABASES["default"]["ENGINE"] == "django.db.backends.postgresql"
    # Connection reuse and health checks matter behind a pooler.
    assert module.DATABASES["default"]["CONN_MAX_AGE"] == 600
