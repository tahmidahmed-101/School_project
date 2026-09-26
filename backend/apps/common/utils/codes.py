from __future__ import annotations

import hashlib
import secrets
import uuid


def generate_numeric_code(length: int = 6) -> str:
    """Generate a random zero-padded numeric code (e.g. for OTP verification)."""
    upper_bound = 10**length
    return f"{secrets.randbelow(upper_bound):0{length}d}"


def hash_code(code: str) -> str:
    """SHA-256 hex digest, for storing verification codes at rest instead of plaintext."""
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def generate_uuid_str() -> str:
    return str(uuid.uuid4())


def generate_document_number(prefix: str) -> str:
    """Short, human-readable document number (e.g. "PO-A1B2C3D4") for
    purchase orders, sales orders, RMAs, etc. Not guaranteed globally unique
    on its own — callers with a uniqueness constraint should retry on
    collision, same as `apps.common.utils.text.unique_slug_for`."""
    return f"{prefix}-{uuid.uuid4().hex[:8].upper()}"
