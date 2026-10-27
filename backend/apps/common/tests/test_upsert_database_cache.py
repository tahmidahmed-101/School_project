from __future__ import annotations

import pytest
from django.core.cache.backends.db import DatabaseCache
from django.core.management import call_command
from django.db import connection

from apps.common.cache import UpsertDatabaseCache

pytestmark = pytest.mark.django_db


@pytest.fixture
def cache():
    call_command("createcachetable", "django_cache", verbosity=0)
    return UpsertDatabaseCache("django_cache", {})


def test_settings_use_the_upsert_backend_for_the_database_cache():
    import importlib

    from decouple import config

    if config("REDIS_URL", default=""):
        pytest.skip("Redis configured")
    base = importlib.import_module("config.settings.base")
    assert base.CACHES["default"]["BACKEND"] == "apps.common.cache.UpsertDatabaseCache"
    assert issubclass(UpsertDatabaseCache, DatabaseCache)


def test_set_overwrites_and_get_reads_back(cache):
    cache.set("k", 1, 60)
    cache.set("k", 2, 60)
    assert cache.get("k") == 2


def test_set_survives_a_competing_insert_of_the_same_key(cache):
    """The loser of the race used to hit a unique violation and lose its write."""
    state = {"raced": False}

    def rival_insert_first(execute, sql, params, many, context):
        if sql.startswith('INSERT INTO "django_cache"') and not state["raced"]:
            state["raced"] = True
            context["cursor"].execute(
                'INSERT INTO "django_cache" ("cache_key", "value", "expires") VALUES (%s, %s, %s)',
                [cache.make_key("k"), "rival", "2999-01-01 00:00:00"],
            )
        return execute(sql, params, many, context)

    with connection.execute_wrapper(rival_insert_first):
        cache.set("k", "mine", 60)

    assert state["raced"]
    assert cache.get("k") == "mine"


def test_add_returns_true_only_when_it_stored_the_value(cache):
    assert cache.add("k", "first", 60) is True
    assert cache.add("k", "second", 60) is False
    assert cache.get("k") == "first"


def test_add_replaces_an_expired_entry(cache):
    cache.set("k", "old", 60)
    with connection.cursor() as cursor:
        cursor.execute("UPDATE django_cache SET expires = '2000-01-01 00:00:00'")
    assert cache.add("k", "new", 60) is True
    assert cache.get("k") == "new"


def test_incr_after_add_counts_like_the_stock_backend(cache):
    cache.add("n", 0, 60)
    assert cache.incr("n") == 1
    assert cache.incr("n") == 2


def test_touch_still_extends_a_live_entry_and_refuses_a_missing_one(cache):
    cache.set("k", "v", 1)
    assert cache.touch("k", 600) is True
    assert cache.touch("missing", 600) is False
