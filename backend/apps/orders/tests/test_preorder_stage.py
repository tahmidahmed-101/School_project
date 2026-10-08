"""Pre-order stage: staff-set tracking of where a pre-order is, kept apart
from the order status so stock, payment and accounting never follow it."""

from __future__ import annotations

from decimal import Decimal

import pytest

from apps.accounts.constants import UserRole
from apps.accounts.factories import CustomerUserFactory
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductVariantFactory
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.orders.models import PreorderStage, SalesOrder
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.preorder import set_preorder_stage

pytestmark = pytest.mark.django_db


def _cart():
    variant = ProductVariantFactory(price=Decimal("100.00"))
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("5.00"),
    )
    cart = get_or_create_cart(CustomerUserFactory())
    add_line(order=cart, variant=variant, quantity=1)
    return cart


def _placed(*, preorder=True):
    order = _cart()
    checkout(order=order)
    order.lines.update(is_preorder=preorder)
    order.refresh_from_db()
    return order


def _stage_url(order):
    return f"/api/v1/admin/orders/{order.id}/preorder-stage/"


def _admin(api_client):
    admin = create_user(email="stage-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    return admin


def test_the_stage_list_is_the_owners_twenty_four():
    assert len(PreorderStage.values) == 24
    assert PreorderStage.values[0] == "pending_payment"
    assert PreorderStage.values[-1] == "cancelled"


def test_each_change_is_recorded_and_the_order_status_is_untouched():
    order = _placed()
    status_before = order.status

    set_preorder_stage(order=order, stage=PreorderStage.PURCHASING)
    set_preorder_stage(order=order, stage=PreorderStage.PURCHASING)
    set_preorder_stage(order=order, stage=PreorderStage.CANCELLED, note="supplier out of stock")

    order.refresh_from_db()
    assert order.preorder_stage == PreorderStage.CANCELLED
    assert order.status == status_before
    events = list(order.preorder_stage_events.values_list("stage", "note"))
    assert events == [("purchasing", ""), ("cancelled", "supplier out of stock")]


def test_stock_orders_and_open_carts_are_refused():
    with pytest.raises(BusinessRuleViolationError) as stock_order:
        set_preorder_stage(order=_placed(preorder=False), stage=PreorderStage.PURCHASING)
    assert stock_order.value.code == "not_a_preorder"

    cart = _cart()
    cart.lines.update(is_preorder=True)
    with pytest.raises(BusinessRuleViolationError) as open_cart:
        set_preorder_stage(order=cart, stage=PreorderStage.PURCHASING)
    assert open_cart.value.code == "order_not_placed"
    assert cart.status == SalesOrder.Status.PENDING


def test_admin_sets_a_stage_and_filters_the_order_list_by_it(api_client):
    order = _placed()
    other = _placed()
    admin = _admin(api_client)

    response = api_client.post(
        _stage_url(order),
        {"stage": "received_in_china_warehouse", "note": "carton 3"},
        format="json",
    )

    assert response.status_code == 200, response.data
    data = response.data["data"]
    assert data["has_preorder"] is True
    assert data["preorder_stage"] == "received_in_china_warehouse"
    assert [(e["stage"], e["note"]) for e in data["preorder_stage_events"]] == [
        ("received_in_china_warehouse", "carton 3")
    ]
    assert data["preorder_stage_events"][0]["changed_by_name"] == admin.get_full_name()

    listed = api_client.get(
        "/api/v1/admin/orders/", {"preorder_stage": "received_in_china_warehouse"}
    )
    numbers = [row["order_number"] for row in listed.data["data"]["results"]]
    assert numbers == [order.order_number]
    assert other.order_number not in numbers


def test_admin_api_rejects_unknown_stages_and_stock_orders(api_client):
    order = _placed()
    stock_order = _placed(preorder=False)
    _admin(api_client)

    unknown = api_client.post(_stage_url(order), {"stage": "teleported"}, format="json")
    refused = api_client.post(_stage_url(stock_order), {"stage": "purchasing"}, format="json")

    assert unknown.status_code == 400
    assert refused.status_code in (400, 409, 422)
    assert refused.data["error"]["code"] == "not_a_preorder"
    order.refresh_from_db()
    assert order.preorder_stage == ""


def test_customers_cannot_set_a_stage(api_client):
    order = _placed()
    api_client.force_authenticate(user=order.customer)

    response = api_client.post(_stage_url(order), {"stage": "purchasing"}, format="json")

    assert response.status_code == 403


def test_tracking_shows_the_stage_and_when_each_step_happened(api_client):
    order = _placed()
    order.contact_phone = "01711223344"
    order.save(update_fields=["contact_phone"])
    set_preorder_stage(order=order, stage=PreorderStage.PURCHASING)
    set_preorder_stage(order=order, stage=PreorderStage.PURCHASE_COMPLETED, note="internal only")

    response = api_client.post(
        "/api/v1/public/tracking/orders/track/",
        {"order_number": order.order_number, "phone": "01711223344"},
        format="json",
    )

    assert response.status_code == 200, response.data
    data = response.data["data"]
    assert data["preorder_stage"] == "purchase_completed"
    assert [step["stage"] for step in data["preorder_timeline"]] == [
        "purchasing",
        "purchase_completed",
    ]
    assert all(set(step) == {"stage", "at"} for step in data["preorder_timeline"])
