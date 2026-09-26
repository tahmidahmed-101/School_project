from __future__ import annotations

from apps.orders.constants import PAYMENT_METHOD_REGISTRY, PAYMENT_METHODS_BY_KEY
from apps.orders.models import PaymentMethodSetting


def _enabled_map() -> dict[str, bool]:
    stored = dict(PaymentMethodSetting.objects.values_list("key", "is_enabled"))
    return {spec.key: stored.get(spec.key, True) for spec in PAYMENT_METHOD_REGISTRY}


def is_payment_method_enabled(key: str) -> bool:
    spec = PAYMENT_METHODS_BY_KEY.get(key)
    if spec is None:
        return False
    if not spec.can_disable:
        return True
    return _enabled_map()[key]


def payment_methods_list() -> list[dict]:
    enabled = _enabled_map()
    return [
        {
            "key": spec.key,
            "label": spec.label,
            "description": spec.description,
            "is_enabled": True if not spec.can_disable else enabled[spec.key],
            "can_disable": spec.can_disable,
            "locked_reason": spec.locked_reason,
        }
        for spec in PAYMENT_METHOD_REGISTRY
    ]


def get_payment_method_state(key: str) -> dict | None:
    return next((row for row in payment_methods_list() if row["key"] == key), None)


def enabled_payment_method_keys() -> list[str]:
    return [row["key"] for row in payment_methods_list() if row["is_enabled"]]
