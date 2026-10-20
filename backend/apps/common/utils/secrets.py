"""Encryption at rest for credentials staff save through the dashboard.

Fernet (AES-128-CBC with an HMAC-SHA256 tag) under the server-only
`SECRETS_ENCRYPTION_KEYS`. The first key encrypts; every listed key decrypts,
so rotating means putting a new key first and keeping the old one until every
stored value has been saved again. A plaintext never leaves these functions in
an exception message or a log line.
"""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from django.conf import settings

from apps.common.exceptions import BusinessRuleViolationError


class SecretUnavailableError(Exception):
    """A stored secret cannot be decrypted: no key is configured, or none of
    the configured keys is the one it was encrypted with."""


def _keys() -> list[str]:
    return [key.strip() for key in settings.SECRETS_ENCRYPTION_KEYS if key.strip()]


def encryption_available() -> bool:
    return bool(_keys())


def _fernet() -> MultiFernet:
    try:
        return MultiFernet([Fernet(key.encode()) for key in _keys()])
    except (ValueError, TypeError):
        # The message names the setting, never the key.
        raise SecretUnavailableError("SECRETS_ENCRYPTION_KEYS holds an invalid key.") from None


def encrypt_secret(plaintext: str) -> str:
    if not encryption_available():
        raise BusinessRuleViolationError(
            "Secrets cannot be saved until the server has SECRETS_ENCRYPTION_KEYS set.",
            code="encryption_key_missing",
        )
    try:
        return _fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")
    except SecretUnavailableError:
        raise BusinessRuleViolationError(
            "The server's SECRETS_ENCRYPTION_KEYS setting is not a valid key.",
            code="encryption_key_invalid",
        ) from None


def decrypt_secret(ciphertext: str) -> str:
    if not encryption_available():
        raise SecretUnavailableError("SECRETS_ENCRYPTION_KEYS is not set.")
    try:
        return _fernet().decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        raise SecretUnavailableError("No configured key decrypts this secret.") from None
