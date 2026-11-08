"""The manual status override does the work each status stands for: a pending
order is checked out, a confirmed one is shipped, a shipped one is delivered.
No payment is recorded by any of them.
"""

from __future__ import annotations

import pytest

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.selectors.stock import get_stock_item
from apps.orders.models import Payment, SalesOrder, Shipment, StockReservation
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.orders import allowed_status_overrides, set_order_status
from apps.orders.services.payments import capture_payment
from apps.risk.models import RiskAssessment

from .test_api import _reserved_order, _stocked_variant

pytestmark = pytest.mark.django_db


def _pending_cart(email: str, quantity: int = 3):
    variant = _stocked_variant(quantity=10)
    cart = get_or_create_cart(create_user(email=email))
    add_line(order=cart, variant=variant, quantity=quantity)
    return cart, variant


def _stock(variant) -> tuple[int, int]:
    item = get_stock_item(variant=variant)
    return item.quantity_on_hand, item.quantity_reserved


def _status(order) -> str:
    return SalesOrder.objects.get(pk=order.pk).status


@pytest.mark.parametrize(
    "target", [SalesOrder.Status.AWAITING_PAYMENT, SalesOrder.Status.CONFIRMED]
)
def test_moving_a_pending_order_forward_checks_it_out(target):
    cart, variant = _pending_cart("manual-pending@example.com")
    assert _stock(variant) == (10, 0)

    set_order_status(order=cart, new_status=target)

    assert _status(cart) == target
    assert _stock(variant) == (10, 3)
    assert (
        StockReservation.objects.filter(
            order_line__order=cart, status=StockReservation.Status.ACTIVE
        ).count()
        == 1
    )


def test_a_pending_order_is_not_moved_when_stock_is_short():
    cart, variant = _pending_cart("manual-short@example.com", quantity=3)
    item = get_stock_item(variant=variant)
    item.quantity_on_hand = 1
    item.save(update_fields=["quantity_on_hand"])

    with pytest.raises(BusinessRuleViolationError):
        set_order_status(order=cart, new_status=SalesOrder.Status.CONFIRMED)

    assert _status(cart) == SalesOrder.Status.PENDING


def test_confirming_by_hand_records_no_payment_and_scores_the_order():
    order, variant = _reserved_order("manual-confirm@example.com")
    assert order.status == SalesOrder.Status.AWAITING_PAYMENT

    set_order_status(order=order, new_status=SalesOrder.Status.CONFIRMED)

    assert _status(order) == SalesOrder.Status.CONFIRMED
    assert _stock(variant) == (10, 3)  # the checkout hold is kept, not doubled
    assert not Payment.objects.filter(order=order, status=Payment.Status.CAPTURED).exists()
    assert RiskAssessment.objects.filter(order=order).exists()
    # The money is still owed and can be captured afterwards.
    order.refresh_from_db()
    capture_payment(order=order, amount=order.grand_total)
    assert Payment.objects.filter(order=order, status=Payment.Status.CAPTURED).count() == 1


def test_marking_a_confirmed_order_shipped_ships_every_remaining_unit():
    order, variant = _reserved_order("manual-ship@example.com")
    set_order_status(order=order, new_status=SalesOrder.Status.CONFIRMED)

    set_order_status(order=order, new_status=SalesOrder.Status.SHIPPED)

    assert _status(order) == SalesOrder.Status.SHIPPED
    shipment = Shipment.objects.get(order=order)
    assert shipment.status == Shipment.Status.SHIPPED
    assert shipment.lines.get().quantity == 3
    assert order.lines.get().shipped_quantity == 3
    assert _stock(variant) == (7, 0)


def test_shipped_then_delivered_by_hand_completes_the_order():
    order, _ = _reserved_order("manual-deliver@example.com")
    set_order_status(order=order, new_status=SalesOrder.Status.CONFIRMED)
    set_order_status(order=order, new_status=SalesOrder.Status.SHIPPED)

    set_order_status(order=order, new_status=SalesOrder.Status.DELIVERED)

    assert _status(order) == SalesOrder.Status.DELIVERED
    assert Shipment.objects.get(order=order).status == Shipment.Status.DELIVERED


def test_an_order_set_to_shipped_with_nothing_shipped_can_go_back_to_confirmed():
    """Orders marked shipped by hand before the override ran the shipment."""
    order, variant = _reserved_order("manual-repair@example.com")
    SalesOrder.objects.filter(pk=order.pk).update(status=SalesOrder.Status.SHIPPED)
    order.refresh_from_db()
    assert SalesOrder.Status.CONFIRMED in allowed_status_overrides(order)

    set_order_status(order=order, new_status=SalesOrder.Status.CONFIRMED)
    set_order_status(order=order, new_status=SalesOrder.Status.SHIPPED)

    assert _status(order) == SalesOrder.Status.SHIPPED
    assert order.lines.get().shipped_quantity == 3
    assert _stock(variant) == (7, 0)
    assert SalesOrder.Status.CONFIRMED not in allowed_status_overrides(order)


def test_admin_marks_an_order_shipped_through_the_status_endpoint(api_client):
    api_client.force_authenticate(
        user=create_user(email="manual-admin@example.com", role=UserRole.ADMIN)
    )
    order, _ = _reserved_order("manual-api@example.com")
    set_order_status(order=order, new_status=SalesOrder.Status.CONFIRMED)

    response = api_client.post(
        f"/api/v1/admin/orders/{order.id}/status/", {"status": "shipped"}, format="json"
    )

    assert response.status_code == 200
    data = response.data["data"]
    assert data["status"] == "shipped"
    assert data["lines"][0]["shipped_quantity"] == 3
    assert data["allowed_statuses"] == ["delivered", "closed"]
