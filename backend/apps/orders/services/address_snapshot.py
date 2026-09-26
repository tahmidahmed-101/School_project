from __future__ import annotations

from typing import Any

SNAPSHOT_FIELDS = (
    "full_name",
    "phone",
    "line1",
    "line2",
    "postal_code",
    "country",
)


def build_address_snapshot(address: Any) -> dict[str, str]:
    if address is None:
        return {}
    return {field: getattr(address, field, "") or "" for field in SNAPSHOT_FIELDS}


def snapshot_or_live(order: Any) -> dict[str, str]:
    """Prefer the snapshot; fall back to the live relation for orders placed
    before snapshotting existed."""
    return order.shipping_address_snapshot or build_address_snapshot(order.shipping_address)
