"""An order is not paid until someone has the money. These tests pin the
rules that follow from that: a storefront order records what is owed rather
than a captured payment, cash on delivery is captured later, and neither
cancelling nor the manual status override can stand in for a payment or a
shipment. They also pin the pre-order limit and checkout re-pricing.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounting.models import JournalEntry
from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductVariantFactory
from apps.common.exceptions import BusinessRuleViolationError
from apps.orders.constants import PaymentMethodKey
from apps.orders.factories import PaymentFactory, SalesOrderFactory, SalesOrderLineFactory
from apps.orders.models import Payment, SalesOrder
from apps.orders.services.carts import add_line, get_or_create_cart, update_line
from apps.orders.services.checkout import checkout
from apps.orders.services.invoice_document import build_invoice_context
from apps.orders.services.orders import cancel_order, set_order_status, update_order_line
from apps.orders.services.payments import capture_payment, record_payment_due, refund_payment

from .test_api import _reserved_order, _stocked_variant
from .test_public_checkout_api import GUEST_CHECKOUT_URL, _configured_delivery, _guest_payload

pytestmark = pytest.mark.django_db


def _payment_entries(payment) -> int:
    return JournalEntry.objects.filter(
        reference_type="customer_payment", reference_id=payment.id
    ).count()


def _cod_order(email: str = "cod-order@example.com"):
    order, variant = _reserved_order(email)
    record_payment_due(order=order, method=PaymentMethodKey.COD)
    order.refresh_from_db()
    return order, variant


def _preorder_variant(limit: int | None = 5, **fields):
    now = timezone.now()
    return ProductVariantFactory(
        product__category__category_type="preorder",
        is_preorder_enabled=True,
        preorder_start_date=now - timedelta(days=1),
        preorder_end_date=now + timedelta(days=1),
        preorder_stock_limit=limit,
        **fields,
    )


def test_cod_checkout_confirms_the_order_without_recording_money(api_client):
    variant = _stocked_variant()
    _configured_delivery()

    response = api_client.post(GUEST_CHECKOUT_URL, _guest_payload(variant), format="json")

    assert response.status_code == 201
    order = SalesOrder.objects.get(id=response.data["data"]["id"])
    assert order.status == SalesOrder.Status.CONFIRMED
    payment = Payment.objects.get(order=order)
    assert payment.method == PaymentMethodKey.COD
    assert payment.status == Payment.Status.PENDING
    assert payment.amount == order.grand_total
    assert _payment_entries(payment) == 0


def test_storefront_order_with_another_method_waits_for_staff_to_verify_it(api_client):
    variant = _stocked_variant()
    _configured_delivery()

    response = api_client.post(
        GUEST_CHECKOUT_URL, _guest_payload(variant, payment_method="bkash"), format="json"
    )

    assert response.status_code == 201
    order = SalesOrder.objects.get(id=response.data["data"]["id"])
    assert order.status == SalesOrder.Status.AWAITING_PAYMENT
    payment = Payment.objects.get(order=order)
    assert payment.method == PaymentMethodKey.BKASH
    assert payment.status == Payment.Status.PENDING


def test_staff_capture_turns_the_pending_row_into_the_payment():
    order, _ = _reserved_order("pending-then-captured@example.com")
    owed = record_payment_due(order=order, method=PaymentMethodKey.BKASH)

    payment = capture_payment(
        order=order, amount=order.grand_total, method=PaymentMethodKey.BKASH, reference="TRX-1"
    )

    order.refresh_from_db()
    assert payment.id == owed.id
    assert payment.status == Payment.Status.CAPTURED
    assert order.status == SalesOrder.Status.CONFIRMED
    assert Payment.objects.filter(order=order).count() == 1


def test_cod_cash_is_captured_after_confirmation_and_only_once():
    order, _ = _cod_order()
    owed = Payment.objects.get(order=order)

    payment = capture_payment(order=order, amount=order.grand_total, method=PaymentMethodKey.COD)

    order.refresh_from_db()
    assert payment.id == owed.id
    assert payment.status == Payment.Status.CAPTURED
    assert order.status == SalesOrder.Status.CONFIRMED
    assert _payment_entries(payment) == 1

    with pytest.raises(BusinessRuleViolationError) as exc:
        capture_payment(order=order, amount=order.grand_total, method=PaymentMethodKey.COD)
    assert exc.value.code == "invalid_order_status"


def test_cod_cash_can_be_captured_once_the_order_has_shipped():
    order, _ = _cod_order("cod-shipped@example.com")
    SalesOrder.objects.filter(pk=order.pk).update(status=SalesOrder.Status.DELIVERED)

    payment = capture_payment(order=order, amount=order.grand_total, method=PaymentMethodKey.COD)

    order.refresh_from_db()
    assert payment.status == Payment.Status.CAPTURED
    assert order.status == SalesOrder.Status.DELIVERED


def test_cancelling_a_cod_order_stops_the_cash_being_owed():
    order, _ = _cod_order("cod-cancelled@example.com")

    cancel_order(order=order)

    assert Payment.objects.get(order=order).status == Payment.Status.FAILED


def test_an_order_with_a_consignment_out_cannot_be_cancelled():
    order, _ = _cod_order("partly-shipped@example.com")
    order.lines.update(shipped_quantity=1)

    with pytest.raises(BusinessRuleViolationError) as exc:
        cancel_order(order=order)

    assert exc.value.code == "order_partly_shipped"
    order.refresh_from_db()
    assert order.status == SalesOrder.Status.CONFIRMED


@pytest.mark.parametrize(
    ("current", "target"),
    [
        (SalesOrder.Status.AWAITING_PAYMENT, SalesOrder.Status.CONFIRMED),
        (SalesOrder.Status.CONFIRMED, SalesOrder.Status.SHIPPED),
        (SalesOrder.Status.CONFIRMED, SalesOrder.Status.PENDING),
        (SalesOrder.Status.SHIPPED, SalesOrder.Status.CONFIRMED),
        (SalesOrder.Status.DELIVERED, SalesOrder.Status.PENDING),
    ],
)
def test_status_override_cannot_skip_payment_or_shipment_or_reopen_a_cart(current, target):
    order = SalesOrderFactory(status=current)

    with pytest.raises(BusinessRuleViolationError) as exc:
        set_order_status(order=order, new_status=target)

    assert exc.value.code == "status_change_not_allowed"
    order.refresh_from_db()
    assert order.status == current


def test_an_open_cart_does_not_hold_a_preorder_slot():
    variant = _preorder_variant(limit=5)
    first = get_or_create_cart(create_user(email="slot-first@example.com"))
    second = get_or_create_cart(create_user(email="slot-second@example.com"))

    add_line(order=first, variant=variant, quantity=5)
    add_line(order=second, variant=variant, quantity=5)
    checkout(order=first)

    with pytest.raises(BusinessRuleViolationError) as exc:
        checkout(order=second)
    assert exc.value.code == "preorder_stock_exceeded"


def test_a_buyers_own_cart_is_not_counted_against_them():
    variant = _preorder_variant(limit=5)
    cart = get_or_create_cart(create_user(email="slot-own-cart@example.com"))

    line = add_line(order=cart, variant=variant, quantity=3)
    update_line(line=line, quantity=5)

    line.refresh_from_db()
    assert line.quantity == 5
    with pytest.raises(BusinessRuleViolationError):
        update_line(line=line, quantity=6)


def test_staff_cannot_raise_a_placed_preorder_line_past_the_limit():
    variant = _preorder_variant(limit=5)
    cart = get_or_create_cart(create_user(email="slot-staff-edit@example.com"))
    line = add_line(order=cart, variant=variant, quantity=4)
    checkout(order=cart)

    update_order_line(line=line, quantity=5)
    with pytest.raises(BusinessRuleViolationError) as exc:
        update_order_line(line=line, quantity=6)
    assert exc.value.code == "preorder_stock_exceeded"


def test_checkout_charges_todays_price_not_the_one_saved_in_the_cart():
    variant = _stocked_variant()
    cart = get_or_create_cart(create_user(email="repriced@example.com"))
    line = add_line(order=cart, variant=variant, quantity=2)
    saved_price = line.unit_price
    variant.price = saved_price + Decimal("10.00")
    variant.save(update_fields=["price"])

    checkout(order=cart)

    line.refresh_from_db()
    cart.refresh_from_db()
    assert line.unit_price == saved_price + Decimal("10.00")
    assert cart.subtotal == line.unit_price * 2


def test_invoice_does_not_call_uncollected_cod_paid():
    order, _ = _cod_order("invoice-cod@example.com")

    context = build_invoice_context(order)

    assert context["doc_status"] == "unpaid"
    assert context["paid"] == Decimal("0.00")
    assert context["balance"] == order.grand_total
    assert context["is_settled"] is False


def test_invoice_after_a_full_refund_shows_nothing_paid_rather_than_a_negative():
    order = SalesOrderFactory(status=SalesOrder.Status.CONFIRMED)
    SalesOrderLineFactory(order=order, quantity=2, unit_price=Decimal("19.99"))
    order.recalculate_totals()
    payment = PaymentFactory(order=order, amount=order.grand_total, method="cash")
    refund_payment(payment=payment)

    context = build_invoice_context(order)

    assert context["doc_status"] == "refunded"
    assert context["paid"] == Decimal("0.00")
    assert context["refunded"] == order.grand_total


def test_admin_order_shows_what_is_owed_and_which_lines_are_preorder(api_client):
    api_client.force_authenticate(
        user=create_user(email="unpaid-admin@example.com", role=UserRole.ADMIN)
    )
    order, _ = _cod_order("admin-view-cod@example.com")
    preorder = SalesOrderFactory(
        status=SalesOrder.Status.CONFIRMED, order_type=SalesOrder.OrderType.PREORDER
    )
    SalesOrderLineFactory(order=preorder, is_preorder=True)

    response = api_client.get(f"/api/v1/admin/orders/{order.id}/")

    data = response.data["data"]
    assert data["paid_total"] == "0.00"
    assert data["balance_due"] == str(order.grand_total)
    assert data["allowed_statuses"] == ["delivered", "cancelled", "closed"]
    assert data["lines"][0]["is_preorder"] is False

    response = api_client.get("/api/v1/admin/orders/", {"order_type": "preorder"})
    assert [row["id"] for row in response.data["data"]["results"]] == [str(preorder.id)]
    response = api_client.get("/api/v1/admin/orders/", {"order_type": "stock"})
    assert [row["id"] for row in response.data["data"]["results"]] == [str(order.id)]
