from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from apps.accounting.services.money import quantize_money
from apps.accounting.services.postings import post_customer_payment, post_customer_refund
from apps.audit.services.audit import log_action
from apps.common.exceptions import BusinessRuleViolationError
from apps.orders.constants import PAYMENT_METHODS_BY_KEY, PaymentMethodKey
from apps.orders.models import Payment, SalesOrder
from apps.orders.selectors.payment_methods import is_payment_method_enabled
from apps.orders.services.orders import lock_order


@transaction.atomic
def capture_payment(
    *, order: SalesOrder, amount: Decimal, method: str = PaymentMethodKey.MANUAL
) -> Payment:
    """Stubbed gateway capture — always succeeds and records the payment.
    A real gateway integration is out of scope; this is the seam a future
    one would plug into."""
    lock_order(order)
    if order.status != SalesOrder.Status.AWAITING_PAYMENT:
        raise BusinessRuleViolationError(
            "Payment can only be captured for a checked-out order awaiting payment.",
            code="invalid_order_status",
        )
    if not order.lines.exists():
        raise BusinessRuleViolationError(
            "Cannot capture payment for an empty order.", code="empty_order"
        )
    if amount != order.grand_total:
        raise BusinessRuleViolationError(
            "Payment amount does not match the order total.", code="amount_mismatch"
        )
    method = method or PaymentMethodKey.MANUAL
    spec = PAYMENT_METHODS_BY_KEY.get(method)
    if spec is None:
        raise BusinessRuleViolationError(
            f"{method} is not a payment method.", code="unknown_payment_method"
        )
    if not is_payment_method_enabled(method):
        raise BusinessRuleViolationError(
            f"{spec.label} is switched off.", code="payment_method_disabled"
        )

    payment = Payment.objects.create(
        order=order, amount=amount, method=method, status=Payment.Status.CAPTURED
    )
    post_customer_payment(payment)
    order.status = SalesOrder.Status.CONFIRMED
    order.save(update_fields=["status"])
    return payment


@transaction.atomic
def refund_payment(*, payment: Payment, amount: Decimal | None = None, actor=None) -> Payment:
    """Refund all or part of a captured payment.

    `amount` defaults to the whole outstanding balance. Refunds accumulate on
    `refunded_amount` under a row lock so repeated calls — a retried request,
    two staff acting at once — can never refund more than was captured. The
    payment is only marked REFUNDED once nothing is left outstanding.
    """
    payment = Payment.objects.select_for_update().select_related("order").get(pk=payment.pk)
    if payment.status != Payment.Status.CAPTURED:
        raise BusinessRuleViolationError(
            "Only a captured payment can be refunded.", code="not_captured"
        )

    outstanding = payment.amount - payment.refunded_amount
    if amount is None:
        amount = outstanding
    amount = quantize_money(Decimal(amount))
    if amount <= 0:
        raise BusinessRuleViolationError("Refund amount must be positive.", code="invalid_amount")
    if amount > outstanding:
        raise BusinessRuleViolationError(
            f"Refund of {amount} exceeds the {outstanding} still outstanding on this payment.",
            code="refund_exceeds_payment",
        )

    payment.refunded_amount += amount
    update_fields = ["refunded_amount", "updated_at"]
    if payment.refunded_amount >= payment.amount:
        payment.status = Payment.Status.REFUNDED
        update_fields.append("status")
    payment.save(update_fields=update_fields)

    post_customer_refund(payment, amount=amount)
    log_action(
        actor=actor,
        action="payment.refunded",
        target_type="Payment",
        target_id=payment.id,
        metadata={
            "order_number": payment.order.order_number,
            "amount": str(amount),
            "refunded_total": str(payment.refunded_amount),
        },
    )
    return payment
