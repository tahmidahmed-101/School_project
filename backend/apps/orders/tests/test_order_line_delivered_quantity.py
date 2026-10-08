"""The admin order API reports, per line, how many units DELIVERED consignments
carried — the same count the completion check (`order_shipments_complete`)
reads, so the two cannot disagree."""

from __future__ import annotations

from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.accounts.factories import CustomerUserFactory
from apps.catalog.factories import ProductVariantFactory
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.orders.models import SalesOrder, Shipment
from apps.orders.selectors.shipments import order_shipments_complete
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.payments import capture_payment
from apps.orders.services.shipments import create_shipment, update_shipment_status

pytestmark = pytest.mark.django_db


def _confirmed(*quantities: int) -> SalesOrder:
    order = get_or_create_cart(CustomerUserFactory())
    for quantity in quantities:
        variant = ProductVariantFactory()
        record_movement(
            variant=variant,
            movement_type=MovementType.PURCHASE_IN,
            quantity=20,
            unit_cost=Decimal("5"),
        )
        add_line(order=order, variant=variant, quantity=quantity)
    checkout(order=order)
    order.refresh_from_db()
    capture_payment(order=order, amount=order.grand_total)
    order.refresh_from_db()
    return order


def _ship(order, quantities_by_line: dict, status: str | None = None) -> Shipment:
    shipment = create_shipment(
        order=order,
        lines=[{"order_line": line, "quantity": qty} for line, qty in quantities_by_line.items()],
    )
    if status is not None:
        update_shipment_status(shipment=shipment, status=status)
    return shipment


def _delivered_by_line(api_client, order) -> dict[str, int]:
    response = api_client.get(f"/api/v1/admin/orders/{order.id}/")
    assert response.status_code == 200
    return {line["id"]: line["delivered_quantity"] for line in response.data["data"]["lines"]}


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


def test_line_with_no_delivered_consignment_reports_zero(admin_client):
    order = _confirmed(2)
    line = order.lines.get()
    _ship(order, {line: 2})  # created, still pending

    assert _delivered_by_line(admin_client, order) == {str(line.id): 0}


def test_partial_delivery_counts_only_the_delivered_units(admin_client):
    order = _confirmed(3, 2)
    first_line, second_line = order.lines.order_by("created_at")
    _ship(order, {first_line: 1}, Shipment.Status.DELIVERED)
    _ship(order, {first_line: 2, second_line: 2}, Shipment.Status.OUT_FOR_DELIVERY)

    assert _delivered_by_line(admin_client, order) == {
        str(first_line.id): 1,
        str(second_line.id): 0,
    }
    assert not order_shipments_complete(order)


def test_multiple_delivered_consignments_are_summed_per_line(admin_client):
    order = _confirmed(3, 2)
    first_line, second_line = order.lines.order_by("created_at")
    _ship(order, {first_line: 1, second_line: 2}, Shipment.Status.DELIVERED)
    _ship(order, {first_line: 2}, Shipment.Status.DELIVERED)

    assert _delivered_by_line(admin_client, order) == {
        str(first_line.id): 3,
        str(second_line.id): 2,
    }
    assert order_shipments_complete(order)


@pytest.mark.parametrize(
    "outcome",
    [Shipment.Status.CANCELLED, Shipment.Status.FAILED, Shipment.Status.RETURNED],
)
def test_cancelled_failed_or_returned_consignments_do_not_count(admin_client, outcome):
    order = _confirmed(3)
    line = order.lines.get()
    _ship(order, {line: 1}, Shipment.Status.DELIVERED)
    _ship(order, {line: 2}, outcome)

    assert _delivered_by_line(admin_client, order) == {str(line.id): 1}


def test_deleted_delivered_consignment_does_not_count(admin_client):
    order = _confirmed(2)
    line = order.lines.get()
    _ship(order, {line: 1}, Shipment.Status.DELIVERED)
    deleted = _ship(order, {line: 1}, Shipment.Status.DELIVERED)
    Shipment.objects.filter(pk=deleted.pk).update(deleted_at=timezone.now())

    assert _delivered_by_line(admin_client, order) == {str(line.id): 1}
    assert not order_shipments_complete(order)


def test_order_returned_by_a_mutating_endpoint_also_reports_delivered_quantity(admin_client):
    """These responses serialize an order the service refreshed, whose lines
    were not loaded through the annotated prefetch."""
    order = _confirmed(2)
    line = order.lines.get()
    _ship(order, {line: 1}, Shipment.Status.DELIVERED)

    response = admin_client.patch(
        f"/api/v1/admin/orders/{order.id}/", {"notes": "leave at the gate"}, format="json"
    )

    assert response.status_code == 200
    assert [row["delivered_quantity"] for row in response.data["data"]["lines"]] == [1]


def test_order_list_query_count_does_not_grow_with_orders_or_lines(admin_client):
    def make_order(*quantities: int) -> None:
        order = _confirmed(*quantities)
        for line in order.lines.all():
            _ship(order, {line: 1}, Shipment.Status.DELIVERED)

    make_order(2)
    with CaptureQueriesContext(connection) as small:
        response = admin_client.get("/api/v1/admin/orders/")
    assert response.status_code == 200
    for _ in range(3):
        make_order(2, 2, 2)
    with CaptureQueriesContext(connection) as large:
        admin_client.get("/api/v1/admin/orders/")

    assert len(large) == len(small)


def test_order_detail_query_count_does_not_grow_with_lines(admin_client):
    small = _confirmed(2)
    large = _confirmed(2, 2, 2, 2, 2)
    for order in (small, large):
        for line in order.lines.all():
            _ship(order, {line: 1}, Shipment.Status.DELIVERED)

    with CaptureQueriesContext(connection) as one_line:
        admin_client.get(f"/api/v1/admin/orders/{small.id}/")
    with CaptureQueriesContext(connection) as five_lines:
        admin_client.get(f"/api/v1/admin/orders/{large.id}/")

    assert len(five_lines) == len(one_line)
