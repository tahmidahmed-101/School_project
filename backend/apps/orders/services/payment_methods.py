from __future__ import annotations

from django.db import transaction

from apps.common.exceptions import BusinessRuleViolationError
from apps.common.params import KIND_STOCK
from apps.orders.constants import PAYMENT_METHODS_BY_KEY
from apps.orders.models import PaymentMethodSetting
from apps.orders.selectors.payment_methods import get_payment_method_state


@transaction.atomic
def set_payment_method_enabled(*, key: str, is_enabled: bool, kind: str = KIND_STOCK) -> dict:
    spec = PAYMENT_METHODS_BY_KEY.get(key)
    if spec is None:
        raise BusinessRuleViolationError("Unknown payment method.", code="unknown_payment_method")
    if not spec.can_disable and not is_enabled:
        raise BusinessRuleViolationError(
            spec.locked_reason or f"{spec.label} cannot be switched off.",
            code="payment_method_locked",
        )

    setting, _ = PaymentMethodSetting.objects.get_or_create(key=key, kind=kind)
    if setting.is_enabled != is_enabled:
        setting.is_enabled = is_enabled
        setting.save(update_fields=["is_enabled"])

    return _state(key, kind)


def set_payment_method_pay_to(*, key: str, pay_to: str, kind: str = KIND_STOCK) -> dict:
    if key not in PAYMENT_METHODS_BY_KEY:
        raise BusinessRuleViolationError("Unknown payment method.", code="unknown_payment_method")
    setting, _ = PaymentMethodSetting.objects.get_or_create(key=key, kind=kind)
    setting.pay_to = pay_to.strip()
    setting.save(update_fields=["pay_to"])
    return _state(key, kind)


def _state(key: str, kind: str) -> dict:
    state = get_payment_method_state(key, kind=kind)
    if state is None:
        raise RuntimeError(f"Payment method state missing for known key {key!r}.")
    return state
