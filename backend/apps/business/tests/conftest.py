from __future__ import annotations

import pytest
from django.core.cache import cache

from apps.business.selectors.business_profile import CURRENCY_SYMBOL_CACHE_KEY


@pytest.fixture(autouse=True)
def _reset_currency_symbol_cache():
    # The cache key outlives the test's DB transaction rollback, so a test that
    # changes currency_symbol would otherwise leak a stale symbol to whatever
    # test runs next in this worker.
    yield
    cache.delete(CURRENCY_SYMBOL_CACHE_KEY)
