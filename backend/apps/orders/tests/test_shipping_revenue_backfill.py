"""Migration 0022 flags, for each fully shipped order, the consignment that
recognised its shipping revenue: the last one created."""

from __future__ import annotations

from datetime import timedelta
from importlib import import_module

import pytest
from django.apps import apps
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.orders.factories import (
    SalesOrderFactory,
    SalesOrderLineFactory,
    ShipmentFactory,
    ShipmentLineFactory,
)
from apps.orders.models import Shipment

pytestmark = pytest.mark.django_db

migration = import_module("apps.orders.migrations.0022_shipment_received_back")


def _order(*lines: tuple[int, int]):
    """lines: (quantity, shipped_quantity) per line."""
    order = SalesOrderFactory()
    order_lines = [
        SalesOrderLineFactory(order=order, quantity=quantity, shipped_quantity=shipped)
        for quantity, shipped in lines
    ]
    return order, order_lines


def _shipment(order, line, quantity: int, *, created_at=None) -> Shipment:
    shipment = ShipmentFactory(order=order)
    ShipmentLineFactory(shipment=shipment, order_line=line, quantity=quantity)
    if created_at is not None:
        Shipment.objects.filter(pk=shipment.pk).update(created_at=created_at)
    return shipment


def _run() -> None:
    Shipment.objects.update(includes_shipping_revenue=False)
    migration.mark_shipping_revenue(apps, None)


def _flagged() -> set:
    return set(Shipment.objects.filter(includes_shipping_revenue=True).values_list("id", flat=True))


def test_only_the_last_consignment_of_a_completed_order_is_flagged():
    now = timezone.now()
    order, (line,) = _order((3, 3))
    first = _shipment(order, line, 1, created_at=now - timedelta(days=2))
    last = _shipment(order, line, 2, created_at=now - timedelta(days=1))

    _run()

    assert _flagged() == {last.id}
    assert first.id not in _flagged()


def test_partly_shipped_orders_are_not_flagged_even_with_a_fully_shipped_line():
    order, (full, partial) = _order((2, 2), (3, 1))
    _shipment(order, full, 2)
    _shipment(order, partial, 1)

    _run()

    assert _flagged() == set()


def test_orders_without_shipments_are_ignored():
    _order((1, 1))

    _run()

    assert _flagged() == set()


def test_a_created_at_tie_resolves_to_the_same_row_every_time():
    moment = timezone.now()
    order, (line,) = _order((2, 2))
    shipments = [_shipment(order, line, 1, created_at=moment) for _ in range(2)]

    _run()
    first_run = _flagged()
    _run()

    assert len(first_run) == 1
    assert first_run <= {shipment.id for shipment in shipments}
    assert _flagged() == first_run


def test_query_count_does_not_grow_with_orders():
    order, (line,) = _order((1, 1))
    _shipment(order, line, 1)
    with CaptureQueriesContext(connection) as few:
        migration.mark_shipping_revenue(apps, None)

    for _ in range(25):
        order, (line,) = _order((1, 1))
        _shipment(order, line, 1)
    with CaptureQueriesContext(connection) as many:
        migration.mark_shipping_revenue(apps, None)

    assert len(many) == len(few)
    assert len(_flagged()) == 26
