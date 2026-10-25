"""Staff-managed GA4 / Meta credentials. See `selectors.conversion_settings`
for the precedence rule these rows take part in."""

from __future__ import annotations

import re

from django.db import transaction
from django.utils import timezone

from apps.audit.services.audit import log_action
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.utils.secrets import encrypt_secret
from apps.marketing.models import ConversionEvent, ConversionProviderSetting
from apps.marketing.selectors.conversion_settings import provider_state

Provider = ConversionEvent.Provider

# The storefront validates the same shapes for its public ids (lib/env.ts).
_TRACKING_ID: dict[str, tuple[re.Pattern[str], str]] = {
    Provider.GA4: (re.compile(r"^G-[A-Z0-9]{4,20}$"), "a GA4 Measurement ID like G-XXXXXXXXXX"),
    Provider.META: (re.compile(r"^\d{6,20}$"), "a Meta Pixel ID (digits only)"),
    Provider.TIKTOK: (re.compile(r"^[A-Z0-9]{10,40}$"), "a TikTok Pixel ID like C4ABCDEF123456"),
}
_SECRET: dict[str, tuple[re.Pattern[str], str]] = {
    Provider.GA4: (re.compile(r"^\S{8,255}$"), "a Measurement Protocol API secret"),
    Provider.META: (re.compile(r"^\S{20,1024}$"), "a Conversions API access token"),
    Provider.TIKTOK: (re.compile(r"^\S{20,1024}$"), "an Events API access token"),
}
_TEST_EVENT_CODE = re.compile(r"^[A-Za-z0-9]{1,64}$")


def _clean_tracking_id(provider: str, value: str) -> str:
    value = value.strip()
    if provider in (Provider.GA4, Provider.TIKTOK):
        value = value.upper()
    pattern, expected = _TRACKING_ID[provider]
    if not pattern.match(value):
        raise BusinessRuleViolationError(f"Enter {expected}.", code="invalid_tracking_id")
    return value


def _clean_secret(provider: str, value: str) -> str:
    value = value.strip()
    pattern, expected = _SECRET[provider]
    if not pattern.match(value):
        # Never echo the value back: it may be a real credential pasted wrongly.
        raise BusinessRuleViolationError(f"Enter {expected}.", code="invalid_secret")
    return value


def _clean_test_event_code(provider: str, value: str) -> str:
    value = value.strip()
    if value and provider not in (Provider.META, Provider.TIKTOK):
        raise BusinessRuleViolationError(
            "Only Meta and TikTok take a test event code.", code="test_event_code_not_supported"
        )
    if value and not _TEST_EVENT_CODE.match(value):
        raise BusinessRuleViolationError(
            "Enter the test event code exactly as Events Manager shows it.",
            code="invalid_test_event_code",
        )
    return value


@transaction.atomic
def save_provider_settings(*, provider: str, data: dict, actor=None) -> dict:
    """Create or change the dashboard settings of one provider.

    `data` may hold `tracking_id`, `secret`, `test_event_code` and `is_enabled`;
    an omitted key keeps what is saved, so the secret need not be re-entered to
    change anything else. The first save must bring both the id and the secret,
    unless it only switches the provider off: saving switches the environment
    variables off for this provider, and a half-filled row would do so silently.
    A provider can only be on with both values saved."""
    if provider not in Provider.values:
        raise BusinessRuleViolationError("Unknown provider.", code="unknown_provider")
    existing = (
        ConversionProviderSetting.objects.select_for_update().filter(provider=provider).first()
    )
    creating = existing is None
    if existing is not None:
        row = existing
    else:
        only_disabling = data.get("is_enabled") is False and not (
            data.get("tracking_id") or data.get("secret")
        )
        if not only_disabling and not (data.get("tracking_id") and data.get("secret")):
            raise BusinessRuleViolationError(
                "The first save needs both the ID and the secret.", code="credentials_required"
            )
        row = ConversionProviderSetting(provider=provider, is_enabled=not only_disabling)

    changed: list[str] = []
    if "tracking_id" in data:
        tracking_id = _clean_tracking_id(provider, data["tracking_id"])
        if tracking_id != row.tracking_id:
            row.tracking_id = tracking_id
            changed.append("tracking_id")
    if "secret" in data:
        row.secret_ciphertext = encrypt_secret(_clean_secret(provider, data["secret"]))
        row.secret_updated_at = timezone.now()
        changed.append("secret")
    if "test_event_code" in data:
        test_event_code = _clean_test_event_code(provider, data["test_event_code"])
        if test_event_code != row.test_event_code:
            row.test_event_code = test_event_code
            changed.append("test_event_code")
    if "is_enabled" in data and data["is_enabled"] != row.is_enabled:
        row.is_enabled = data["is_enabled"]
        changed.append("is_enabled")
    if row.is_enabled and not (row.tracking_id and row.secret_ciphertext):
        raise BusinessRuleViolationError(
            "Save both the ID and the secret before switching this provider on.",
            code="credentials_required",
        )

    if creating or changed:
        row.updated_by = actor if getattr(actor, "pk", None) else None
        row.save()
        log_action(
            actor=actor,
            action="conversion_tracking.updated",
            target_type="ConversionProviderSetting",
            target_id=row.id,
            # Field names only: no value of any credential is written here.
            metadata={"provider": provider, "changed": changed, "is_enabled": row.is_enabled},
        )
    return provider_state(provider, row)


@transaction.atomic
def reset_provider_settings(*, provider: str, actor=None) -> dict:
    """Drop the dashboard settings, handing the provider back to the server
    environment variables (or switching it off where there are none)."""
    if provider not in Provider.values:
        raise BusinessRuleViolationError("Unknown provider.", code="unknown_provider")
    deleted, _ = ConversionProviderSetting.objects.filter(provider=provider).delete()
    if deleted:
        log_action(
            actor=actor,
            action="conversion_tracking.reset",
            target_type="ConversionProviderSetting",
            metadata={"provider": provider},
        )
    return provider_state(provider, None)
