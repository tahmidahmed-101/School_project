from __future__ import annotations

import logging
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import F, Sum
from django.utils import timezone

from apps.accounting.services.money import quantize_money
from apps.accounting.services.postings import post_customer_payment, post_customer_refund
from apps.audit.services.audit import log_action
from apps.common.exceptions import BusinessRuleViolationError
from apps.orders.constants import PAYMENT_METHODS_BY_KEY, PaymentMethodKey
from apps.orders.models import Payment, SalesOrder
from apps.orders.selectors.payment_methods import is_payment_method_enabled
from apps.orders.selectors.payments import order_deposit_due
from apps.orders.services.orders import lock_order

logger = logging.getLogger(__name__)

# A cash-on-delivery order is confirmed before any money moves, so its
# payment is captured later, at whatever stage the cash actually arrives.
COD_COLLECTABLE_STATUSES = frozenset(
    {
        SalesOrder.Status.CONFIRMED,
        SalesOrder.Status.SHIPPED,
        SalesOrder.Status.DELIVERED,
    }
)


def _require_enabled_method(method: str):
    spec = PAYMENT_METHODS_BY_KEY.get(method)
    if spec is None:
        raise BusinessRuleViolationError(
            f"{method} is not a payment method.", code="unknown_payment_method"
        )
    if not is_payment_method_enabled(method):
        raise BusinessRuleViolationError(
            f"{spec.label} is switched off.", code="payment_method_disabled"
        )
    return spec


def _balance_due(order: SalesOrder) -> Decimal:
    """Read from the table, not `order.payments`, which a caller may have prefetched."""
    received = Payment.objects.filter(
        order=order, status__in=(Payment.Status.CAPTURED, Payment.Status.REFUNDED)
    ).aggregate(total=Sum(F("amount") - F("refunded_amount")))["total"] or Decimal("0.00")
    return max(order.grand_total - received, Decimal("0.00"))


@transaction.atomic
def record_payment_due(*, order: SalesOrder, method: str) -> Payment:
    """Record how a checked-out order will be paid without claiming the money
    has arrived: a pending payment row and no ledger entry. Cash on delivery
    is confirmed now, since the courier collects it; any other method waits in
    "awaiting payment" until staff verify it. `capture_payment` turns the row
    into a captured payment either way."""
    lock_order(order)
    if order.status != SalesOrder.Status.AWAITING_PAYMENT:
        raise BusinessRuleViolationError(
            "Only a checked-out order awaiting payment can take a payment method.",
            code="invalid_order_status",
        )
    if not order.lines.exists():
        raise BusinessRuleViolationError("Cannot place an empty order.", code="empty_order")
    _require_enabled_method(method)

    payment = Payment.objects.create(
        order=order,
        amount=order.grand_total,
        method=method,
        status=Payment.Status.PENDING,
    )
    # A pre-order waits for its deposit whatever the method; the balance is then
    # collected against this same row.
    needs_deposit = (
        order.order_type == SalesOrder.OrderType.PREORDER and order_deposit_due(order) > 0
    )
    if method == PaymentMethodKey.COD and not needs_deposit:
        order.status = SalesOrder.Status.CONFIRMED
        order.save(update_fields=["status"])
        _assess_order_risk(order)
    return payment


@transaction.atomic
def capture_payment(
    *,
    order: SalesOrder,
    amount: Decimal,
    method: str = PaymentMethodKey.MANUAL,
    reference: str = "",
) -> Payment:
    """Manual/staff-attested capture — this project has no live payment
    gateway integration. `cash`/`cod`/`manual` are attested by whoever is
    physically present for the exchange, so they need no reference; every
    other method requires one (`PaymentMethodSpec.requires_reference`),
    since a reference — a bKash TrxID, a bank statement line, a card
    terminal slip number — is the only evidence available that money
    actually moved. Capturing one of those without a reference would be
    pretending a gateway verified a payment that nothing here can verify.

    Idempotent by (order, reference): a retried request carrying the same
    reference for this order returns the payment already captured for it
    instead of raising `invalid_order_status` or capturing a second time.
    A reference already used on a *different* payment — another order, or a
    non-captured row — is refused outright: one external transaction (a
    bKash TrxID, a bank statement line) must never back two Payment rows
    (enforced by `payment_gateway_reference_unique` as the last line of
    defense against a genuine race, since the lock above only covers this
    order, not every order that could race on the same reference).
    """
    lock_order(order)
    reference = (reference or "").strip()

    if reference:
        existing = Payment.objects.filter(gateway_reference=reference).first()
        if existing is not None:
            if existing.order_id == order.id and existing.status == Payment.Status.CAPTURED:
                return existing
            raise BusinessRuleViolationError(
                "This payment reference has already been used for another payment.",
                code="duplicate_gateway_reference",
            )

    awaiting = order.status == SalesOrder.Status.AWAITING_PAYMENT
    owed = None
    if awaiting or order.status in COD_COLLECTABLE_STATUSES:
        owed = (
            Payment.objects.select_for_update()
            .filter(order=order, status=Payment.Status.PENDING)
            .first()
        )
    balance = _balance_due(order)
    if not (awaiting or order.status in COD_COLLECTABLE_STATUSES) or balance <= 0:
        raise BusinessRuleViolationError(
            "Payment can only be captured for a placed order with a balance due.",
            code="invalid_order_status",
        )
    if not order.lines.exists():
        raise BusinessRuleViolationError(
            "Cannot capture payment for an empty order.", code="empty_order"
        )
    if amount <= 0 or amount > balance:
        raise BusinessRuleViolationError(
            f"Enter an amount up to the balance due ({balance}).", code="amount_mismatch"
        )
    method = method or PaymentMethodKey.MANUAL
    spec = _require_enabled_method(method)
    if spec.requires_reference and not reference:
        raise BusinessRuleViolationError(
            f"{spec.label} has no live gateway integration — a payment reference "
            "is required to capture it.",
            code="payment_reference_required",
        )

    try:
        # Own savepoint: catching IntegrityError inside the outer atomic
        # block would otherwise leave it unusable for the raise below.
        with transaction.atomic():
            if owed is not None and amount < owed.amount:
                owed.amount -= amount
                owed.save(update_fields=["amount", "updated_at"])
                owed = None
            if owed is not None:
                owed.amount = amount
                owed.method = method
                owed.gateway_reference = reference
                owed.status = Payment.Status.CAPTURED
                owed.save(
                    update_fields=["amount", "method", "gateway_reference", "status", "updated_at"]
                )
                payment = owed
            else:
                payment = Payment.objects.create(
                    order=order,
                    amount=amount,
                    method=method,
                    status=Payment.Status.CAPTURED,
                    gateway_reference=reference,
                )
    except IntegrityError:
        raise BusinessRuleViolationError(
            "This payment reference has already been used for another payment.",
            code="duplicate_gateway_reference",
        ) from None
    # A pending row dates from the order; the money arrived today.
    post_customer_payment(payment, entry_date=timezone.localdate() if owed else None)
    if awaiting and order.grand_total - balance + amount >= order_deposit_due(order):
        order.status = SalesOrder.Status.CONFIRMED
        order.save(update_fields=["status"])
        _assess_order_risk(order)
    return payment


def _assess_order_risk(order: SalesOrder) -> None:
    """Score the now-confirmed order for fraud risk. Never let a scoring bug
    undo a payment that already succeeded — but a swallowed failure still
    needs a durable, queryable trace rather than just a log line, or a
    broken scorer silently stops flagging every order it touches with no
    way to notice."""
    try:
        from apps.risk.services.scoring import assess_order_risk

        assess_order_risk(order=order)
    except Exception as exc:
        logger.exception("Risk assessment failed for order %s", order.id)
        log_action(
            actor=None,
            action="risk_assessment.failed",
            target_type="SalesOrder",
            target_id=order.id,
            metadata={"error": str(exc)},
        )


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
