"""capture_payment is a manual/staff-attested capture — this project has no
live payment gateway. These tests pin: a reference is required for methods
that imply one exists to verify against, capture is idempotent by
(order, reference), and a failing risk assessment still leaves a durable
trace instead of vanishing into a log line.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from apps.audit.models import AuditLog
from apps.common.exceptions import BusinessRuleViolationError
from apps.orders.constants import PaymentMethodKey
from apps.orders.models import Payment, SalesOrder
from apps.orders.services.payments import capture_payment

from .test_api import _reserved_order

pytestmark = pytest.mark.django_db


@pytest.fixture
def checked_out_order():
    return _reserved_order("payment-capture-fixture@example.com")


def test_capture_succeeds_with_a_reference_for_a_gateway_like_method(checked_out_order):
    order, _ = checked_out_order

    payment = capture_payment(
        order=order, amount=order.grand_total, method=PaymentMethodKey.BKASH, reference="TRX-1"
    )

    assert payment.status == Payment.Status.CAPTURED
    assert payment.gateway_reference == "TRX-1"
    order.refresh_from_db()
    assert order.status == SalesOrder.Status.CONFIRMED


def test_capture_refuses_a_gateway_like_method_without_a_reference(checked_out_order):
    """No live gateway exists to verify the payment, so a reference is the
    only evidence it happened — capturing without one would be pretending a
    gateway confirmed money that was never actually checked."""
    order, _ = checked_out_order

    with pytest.raises(BusinessRuleViolationError) as exc:
        capture_payment(order=order, amount=order.grand_total, method=PaymentMethodKey.CARD)

    assert exc.value.code == "payment_reference_required"
    order.refresh_from_db()
    assert order.status == SalesOrder.Status.AWAITING_PAYMENT
    assert not Payment.objects.filter(order=order).exists()


def test_capture_does_not_require_a_reference_for_cash_like_methods(checked_out_order):
    """cash/COD/manual are attested by whoever is physically present for the
    exchange — there is nothing external to reference."""
    order, _ = checked_out_order

    payment = capture_payment(order=order, amount=order.grand_total, method=PaymentMethodKey.COD)

    assert payment.status == Payment.Status.CAPTURED
    assert payment.gateway_reference == ""


def test_duplicate_capture_with_the_same_reference_is_idempotent(checked_out_order):
    """A retried request — a client timeout, a redelivered gateway
    callback — carrying the same reference for this order must return the
    payment already captured, not raise and not capture a second time."""
    order, _ = checked_out_order

    first = capture_payment(
        order=order, amount=order.grand_total, method=PaymentMethodKey.BKASH, reference="TRX-2"
    )
    second = capture_payment(
        order=order, amount=order.grand_total, method=PaymentMethodKey.BKASH, reference="TRX-2"
    )

    assert second.id == first.id
    assert Payment.objects.filter(order=order).count() == 1
    order.refresh_from_db()
    assert order.status == SalesOrder.Status.CONFIRMED


def test_duplicate_capture_without_a_reference_is_rejected_not_duplicated(checked_out_order):
    """Without a reference there's nothing to key idempotency on, so a
    second capture attempt after the order is already confirmed must be
    refused outright — never silently create a second payment."""
    order, _ = checked_out_order
    capture_payment(order=order, amount=order.grand_total, method=PaymentMethodKey.COD)

    with pytest.raises(BusinessRuleViolationError) as exc:
        capture_payment(order=order, amount=order.grand_total, method=PaymentMethodKey.COD)

    assert exc.value.code == "invalid_order_status"
    assert Payment.objects.filter(order=order).count() == 1


def test_capture_refuses_a_gateway_reference_already_used_by_another_order(checked_out_order):
    """A gateway reference is one real external transaction (a bKash TrxID,
    a bank statement line) — it must never back two Payment rows, even
    across different orders. Only a retry of the *same* order+reference is
    idempotent; reusing the reference for a different order is a conflict."""
    order, _ = checked_out_order
    other_order, _ = _reserved_order("payment-capture-fixture-2@example.com")
    capture_payment(
        order=order, amount=order.grand_total, method=PaymentMethodKey.BKASH, reference="TRX-3"
    )

    with pytest.raises(BusinessRuleViolationError) as exc:
        capture_payment(
            order=other_order,
            amount=other_order.grand_total,
            method=PaymentMethodKey.BKASH,
            reference="TRX-3",
        )

    assert exc.value.code == "duplicate_gateway_reference"
    other_order.refresh_from_db()
    assert other_order.status == SalesOrder.Status.AWAITING_PAYMENT
    assert not Payment.objects.filter(order=other_order).exists()
    assert Payment.objects.filter(gateway_reference="TRX-3").count() == 1


def test_risk_assessment_failure_leaves_a_durable_trace_but_payment_still_succeeds(
    checked_out_order,
):
    order, _ = checked_out_order

    with patch(
        "apps.risk.services.scoring.assess_order_risk", side_effect=RuntimeError("scorer down")
    ):
        payment = capture_payment(
            order=order, amount=order.grand_total, method=PaymentMethodKey.COD
        )

    # The payment and order confirmation are not undone by a scoring bug.
    assert payment.status == Payment.Status.CAPTURED
    order.refresh_from_db()
    assert order.status == SalesOrder.Status.CONFIRMED

    # But the failure is not silently swallowed either — it leaves a durable,
    # queryable record an operator (or a retry job) can find later.
    entry = AuditLog.objects.get(action="risk_assessment.failed", target_id=str(order.id))
    assert "scorer down" in entry.metadata["error"]
