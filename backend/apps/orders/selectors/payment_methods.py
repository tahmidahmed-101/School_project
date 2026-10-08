from __future__ import annotations

from apps.common.params import KIND_STOCK
from apps.orders.constants import PAYMENT_METHOD_REGISTRY, PAYMENT_METHODS_BY_KEY
from apps.orders.models import PaymentMethodSetting


def _enabled_map(kind: str) -> dict[str, bool]:
    stored = dict(
        PaymentMethodSetting.objects.filter(kind=kind).values_list("key", "is_enabled")
    )
    return {spec.key: stored.get(spec.key, True) for spec in PAYMENT_METHOD_REGISTRY}


def is_payment_method_enabled(key: str, *, kind: str = KIND_STOCK) -> bool:
    spec = PAYMENT_METHODS_BY_KEY.get(key)
    if spec is None:
        return False
    if not spec.can_disable:
        return True
    return _enabled_map(kind)[key]


def payment_methods_list(*, kind: str = KIND_STOCK) -> list[dict]:
    """One half's own switches and pay-to numbers; nothing is read from the other half."""
    enabled = _enabled_map(kind)
    pay_to = dict(PaymentMethodSetting.objects.filter(kind=kind).values_list("key", "pay_to"))
    return [
        {
            "key": spec.key,
            "kind": kind,
            "label": spec.label,
            "description": spec.description,
            "is_enabled": True if not spec.can_disable else enabled[spec.key],
            "pay_to": pay_to.get(spec.key, ""),
            "can_disable": spec.can_disable,
            "locked_reason": spec.locked_reason,
        }
        for spec in PAYMENT_METHOD_REGISTRY
    ]


def get_payment_method_state(key: str, *, kind: str = KIND_STOCK) -> dict | None:
    return next((row for row in payment_methods_list(kind=kind) if row["key"] == key), None)
