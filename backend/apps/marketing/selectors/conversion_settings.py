"""Which GA4 / Meta credentials apply, and where they come from.

Precedence, per provider:
1. A `ConversionProviderSetting` row (saved from the dashboard) decides the
   provider on its own, including switching it off.
2. With no row, the server environment variables apply, exactly as before
   dashboard settings existed.
3. With neither, the provider is off.

Every function here reads all providers' rows in one query.
"""

from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings

from apps.common.utils.secrets import (
    SecretUnavailableError,
    decrypt_secret,
    encryption_available,
)
from apps.marketing.models import ConversionEvent, ConversionProviderSetting

Provider = ConversionEvent.Provider

SOURCE_DASHBOARD = "dashboard"
SOURCE_ENVIRONMENT = "environment"
SOURCE_NONE = "none"

SECRET_SET = "set"  # noqa: S105 - a status label, not a credential
SECRET_MISSING = "missing"  # noqa: S105 - a status label
# Saved, but no configured key decrypts it: the key is missing or was changed.
SECRET_UNREADABLE = "unreadable"  # noqa: S105 - a status label


@dataclass(frozen=True)
class ProviderCredentials:
    provider: str
    tracking_id: str
    secret: str
    test_event_code: str
    source: str


def _environment(provider: str) -> tuple[str, str, str]:
    """(tracking id, secret, test event code) from the server environment."""
    if provider == Provider.GA4:
        return settings.GA4_MEASUREMENT_ID, settings.GA4_API_SECRET, ""
    return settings.META_PIXEL_ID, settings.META_CAPI_ACCESS_TOKEN, settings.META_TEST_EVENT_CODE


def environment_configured(provider: str) -> bool:
    tracking_id, secret, _code = _environment(provider)
    return bool(tracking_id and secret)


def saved_provider_settings() -> dict[str, ConversionProviderSetting]:
    return {row.provider: row for row in ConversionProviderSetting.objects.all()}


def _row_is_complete(row: ConversionProviderSetting) -> bool:
    return bool(row.tracking_id and row.secret_ciphertext)


def active_providers() -> list[str]:
    """Providers a confirmed order owes a Purchase. Decides from what is saved,
    without decrypting: a secret that later fails to decrypt fails its send
    and is retried once the key is restored, rather than losing the purchase."""
    rows = saved_provider_settings()
    active = []
    for provider in Provider.values:
        row = rows.get(provider)
        if row is not None:
            if row.is_enabled and _row_is_complete(row):
                active.append(provider)
        elif environment_configured(provider):
            active.append(provider)
    return active


def load_credentials() -> dict[str, ProviderCredentials | None]:
    """What a send uses, read when it runs, so a credential changed in the
    dashboard applies to the next send and retry. None means the provider is
    off, or its saved secret cannot be decrypted."""
    rows = saved_provider_settings()
    credentials: dict[str, ProviderCredentials | None] = {}
    for provider in Provider.values:
        row = rows.get(provider)
        if row is not None:
            credentials[provider] = None
            if row.is_enabled and _row_is_complete(row):
                try:
                    secret = decrypt_secret(row.secret_ciphertext)
                except SecretUnavailableError:
                    continue
                credentials[provider] = ProviderCredentials(
                    provider=provider,
                    tracking_id=row.tracking_id,
                    secret=secret,
                    test_event_code=row.test_event_code,
                    source=SOURCE_DASHBOARD,
                )
            continue
        tracking_id, secret, test_event_code = _environment(provider)
        credentials[provider] = (
            ProviderCredentials(
                provider=provider,
                tracking_id=tracking_id,
                secret=secret,
                test_event_code=test_event_code,
                source=SOURCE_ENVIRONMENT,
            )
            if tracking_id and secret
            else None
        )
    return credentials


def _secret_status(row: ConversionProviderSetting) -> str:
    if not row.secret_ciphertext:
        return SECRET_MISSING
    try:
        decrypt_secret(row.secret_ciphertext)
    except SecretUnavailableError:
        return SECRET_UNREADABLE
    return SECRET_SET


def provider_state(provider: str, row: ConversionProviderSetting | None) -> dict:
    """What staff may see about one provider: never the secret itself."""
    env_tracking_id, env_secret, env_test_code = _environment(provider)
    env_configured = bool(env_tracking_id and env_secret)
    state: dict = {
        "provider": provider,
        "label": Provider(provider).label,
        "environment_configured": env_configured,
        "encryption_available": encryption_available(),
    }
    if row is not None:
        secret_status = _secret_status(row)
        state.update(
            source=SOURCE_DASHBOARD,
            is_enabled=row.is_enabled,
            is_active=row.is_enabled and bool(row.tracking_id) and secret_status == SECRET_SET,
            tracking_id=row.tracking_id,
            secret_status=secret_status,
            secret_updated_at=row.secret_updated_at,
            test_event_code=row.test_event_code,
            updated_at=row.updated_at,
            updated_by_id=row.updated_by_id,
        )
        return state
    state.update(
        source=SOURCE_ENVIRONMENT if env_configured else SOURCE_NONE,
        is_enabled=env_configured,
        is_active=env_configured,
        tracking_id=env_tracking_id,
        secret_status=SECRET_SET if env_secret else SECRET_MISSING,
        secret_updated_at=None,
        test_event_code=env_test_code,
        updated_at=None,
        updated_by_id=None,
    )
    return state


def provider_states() -> list[dict]:
    rows = saved_provider_settings()
    return [provider_state(provider, rows.get(provider)) for provider in Provider.values]
