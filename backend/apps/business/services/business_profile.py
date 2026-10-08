from __future__ import annotations

from django.core.cache import cache

from apps.business.models import BusinessProfile
from apps.business.selectors.business_profile import CURRENCY_SYMBOL_CACHE_KEY

UPDATABLE_FIELDS = (
    "name",
    "legal_name",
    "tagline",
    "logo_url",
    "phone",
    "whatsapp",
    "email",
    "website",
    "google_maps_url",
    "opening_hours",
    "address_line",
    "district",
    "thana",
    "postcode",
    "country",
    "currency_code",
    "currency_symbol",
    "tax_id",
    "trade_licence_no",
    "facebook_url",
    "instagram_url",
    "tiktok_url",
    "youtube_url",
    "linkedin_url",
    "preorder_deposit_percent",
    "about_en",
    "about_bn",
)


def update_business_profile(*, profile: BusinessProfile, data: dict) -> BusinessProfile:
    changed = [field for field in UPDATABLE_FIELDS if field in data]
    for field in changed:
        setattr(profile, field, data[field])
    if changed:
        profile.save(update_fields=[*changed, "updated_at"])
    if "currency_symbol" in changed:
        cache.delete(CURRENCY_SYMBOL_CACHE_KEY)
    return profile
