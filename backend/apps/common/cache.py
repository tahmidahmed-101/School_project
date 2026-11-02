from __future__ import annotations

import base64
import pickle
from datetime import UTC, datetime
from typing import Any

from django.core.cache.backends.base import DEFAULT_TIMEOUT
from django.core.cache.backends.db import DatabaseCache
from django.db import connections, router
from django.utils import timezone


class UpsertDatabaseCache(DatabaseCache):
    """`DatabaseCache` whose `set`/`add` are one atomic upsert.

    Django's version SELECTs the key and then INSERTs it, so two requests that
    first touch the same key (a page firing several throttled API calls from
    one IP) both try the INSERT. Postgres logs the loser's unique violation and
    Django swallows it, which drops that request's throttle count.
    """

    def _base_set(self, mode: str, key: str, value: Any, timeout: Any = DEFAULT_TIMEOUT):
        if mode == "touch":
            return super()._base_set(mode, key, value, timeout)  # type: ignore[misc]

        timeout = self.get_backend_timeout(timeout)
        db = router.db_for_write(self.cache_model_class)
        connection = connections[db]
        quote = connection.ops.quote_name
        table = quote(self._table)  # type: ignore[attr-defined]
        now = timezone.now().replace(microsecond=0)
        expires_at = datetime.max if timeout is None else datetime.fromtimestamp(timeout, tz=UTC)
        expires = connection.ops.adapt_datetimefield_value(expires_at.replace(microsecond=0))
        encoded = base64.b64encode(pickle.dumps(value, self.pickle_protocol)).decode("latin1")

        with connection.cursor() as cursor:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")  # noqa: S608 -- quoted table name
            count = cursor.fetchone()[0]
            if count > self._max_entries:
                self._cull(db, cursor, now, count)  # type: ignore[attr-defined]

            # `add` must leave a live entry alone but may replace an expired one.
            only_if_expired = f"WHERE {table}.{quote('expires')} < %s" if mode == "add" else ""
            params: list[Any] = [key, encoded, expires]
            if mode == "add":
                params.append(connection.ops.adapt_datetimefield_value(now))
            cursor.execute(
                f"INSERT INTO {table} ({quote('cache_key')}, {quote('value')}, {quote('expires')}) "  # noqa: S608
                f"VALUES (%s, %s, %s) ON CONFLICT ({quote('cache_key')}) DO UPDATE SET "
                f"{quote('value')} = EXCLUDED.{quote('value')}, "
                f"{quote('expires')} = EXCLUDED.{quote('expires')} {only_if_expired}",
                params,
            )
            return cursor.rowcount == 1
