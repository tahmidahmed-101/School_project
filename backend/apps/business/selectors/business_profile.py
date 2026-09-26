from __future__ import annotations

from django.conf import settings
from django.core.cache import cache

from apps.business.models import SINGLETON_ID, BusinessProfile

SEEDED_FIELDS = ("name", "legal_name", "phone", "email", "website", "tax_id")


def _seed_defaults() -> dict[str, str]:
    identity = getattr(settings, "BUSINESS_IDENTITY", {}) or {}
    defaults = {field: identity.get(field, "") for field in SEEDED_FIELDS}
    defaults["address_line"] = identity.get("address", "")
    return defaults


def get_business_profile() -> BusinessProfile:
    """The one row, created from `settings.BUSINESS_IDENTITY` on first access so a
    fresh install already prints the right details on its PDFs."""
    profile, _ = BusinessProfile.objects.get_or_create(pk=SINGLETON_ID, defaults=_seed_defaults())
    return profile


CURRENCY_SYMBOL_CACHE_KEY = "business:currency_symbol"


def get_currency_symbol() -> str:
    """Cached because the PDF `money` filter runs per cell — a fresh query per
    rendered amount would put hundreds of reads behind one invoice."""
    cached = cache.get(CURRENCY_SYMBOL_CACHE_KEY)
    if cached:
        return cached
    symbol = get_business_profile().currency_symbol or settings.CURRENCY_SYMBOL
    cache.set(CURRENCY_SYMBOL_CACHE_KEY, symbol, 300)
    return symbol
