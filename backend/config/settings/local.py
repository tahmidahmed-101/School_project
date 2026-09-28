import os
from typing import cast

# base.py deliberately has no SECRET_KEY fallback, so a committed signing key
# can never reach production. Development still has to start on a fresh clone
# with no .env, so supply a throwaway key here — `setdefault`, so a real
# SECRET_KEY in the environment or .env still wins. Never used outside dev:
# `config.settings.production` requires the variable to be set.
os.environ.setdefault("SECRET_KEY", "insecure-local-development-key-not-for-deployment")

from .base import *  # noqa: F403

DEBUG = True

# Allow all origins in local development so Vite dev server (port 5410) and
# direct browser requests work seamlessly
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:5410",
    "http://127.0.0.1:5410",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

# Browsable API docs without logging in first — development convenience only;
# base.py keeps the schema behind authentication everywhere else.
SPECTACULAR_SETTINGS["SERVE_PERMISSIONS"] = ["rest_framework.permissions.AllowAny"]  # noqa: F405

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",  # noqa: F405
    }
}

# Single-process runserver, so a shared cache backend buys nothing and the
# database one would need `createcachetable` on every fresh clone.
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

# Throttle counters persist across the whole dev-server run (see test.py's
# identical override) — disabled here so a login-heavy e2e run never trips it.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,  # noqa: F405
    "DEFAULT_THROTTLE_RATES": dict.fromkeys(
        cast(dict, REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"])  # noqa: F405
    ),
}

# Add file logging for local development
LOGGING["handlers"]["file"] = {  # noqa: F405
    "level": "DEBUG",
    "class": "logging.FileHandler",
    "filename": BASE_DIR / "debug.log",  # noqa: F405
    "formatter": "verbose",
}
LOGGING["loggers"]["apps"]["handlers"].append("file")  # noqa: F405
