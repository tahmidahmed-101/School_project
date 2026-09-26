from __future__ import annotations

from django.db import transaction

from apps.common.exceptions import BusinessRuleViolationError
from apps.orders.constants import PAYMENT_METHODS_BY_KEY
from apps.orders.models import PaymentMethodSetting
from apps.orders.selectors.payment_methods import get_payment_method_state


@transaction.atomic
def set_payment_method_enabled(*, key: str, is_enabled: bool) -> dict:
    spec = PAYMENT_METHODS_BY_KEY.get(key)
    if spec is None:
        raise BusinessRuleViolationError("Unknown payment method.", code="unknown_payment_method")
    if not spec.can_disable and not is_enabled:
        raise BusinessRuleViolationError(
            spec.locked_reason or f"{spec.label} cannot be switched off.",
            code="payment_method_locked",
        )

    setting, _ = PaymentMethodSetting.objects.get_or_create(key=key)
    if setting.is_enabled != is_enabled:
        setting.is_enabled = is_enabled
        setting.save(update_fields=["is_enabled"])

    state = get_payment_method_state(key)
    if state is None:
        raise RuntimeError(f"Payment method state missing for known key {key!r}.")
    return state
