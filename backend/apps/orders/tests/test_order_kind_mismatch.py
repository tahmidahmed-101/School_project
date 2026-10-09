from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounts.constants import UserRole
from apps.accounts.factories import CustomerUserFactory
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductVariantFactory
from apps.catalog.models import Category
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.orders.factories import SalesOrderFactory
from apps.orders.models import SalesOrder
from apps.orders.services.carts import create_order
from apps.orders.services.orders import add_order_line, add_staff_order_lines

pytestmark = pytest.mark.django_db

ORDERS_URL = "/api/v1/admin/orders/"


def _stock_variant():
    variant = ProductVariantFactory(price=Decimal("100.00"))
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=20,
        unit_cost=Decimal("5.00"),
    )
    return variant


def _preorder_variant():
    now = timezone.now()
    return ProductVariantFactory(
        product__category__category_type=Category.CategoryType.PREORDER,
        price=Decimal("100.00"),
        is_preorder_enabled=True,
        preorder_start_date=now - timedelta(days=1),
        preorder_end_date=now + timedelta(days=10),
    )


def _confirmed(kind):
    return SalesOrderFactory(status=SalesOrder.Status.CONFIRMED, order_type=kind)


def test_staff_order_refuses_a_preorder_variant():
    order = create_order(customer=CustomerUserFactory())

    with pytest.raises(BusinessRuleViolationError) as excinfo:
        add_staff_order_lines(order=order, lines=[(_stock_variant(), 1), (_preorder_variant(), 1)])

    assert excinfo.value.code == "order_kind_mismatch"
    assert order.lines.count() == 0


def test_staff_order_takes_stock_variants():
    order = create_order(customer=CustomerUserFactory())

    add_staff_order_lines(order=order, lines=[(_stock_variant(), 2)])

    assert order.lines.count() == 1


def test_staff_order_endpoint_refuses_a_preorder_variant(api_client):
    api_client.force_authenticate(
        user=create_user(email="kind-orders-admin@example.com", role=UserRole.ADMIN)
    )
    customer = CustomerUserFactory()

    response = api_client.post(
        ORDERS_URL,
        {
            "customer_id": str(customer.id),
            "lines": [{"variant_id": str(_preorder_variant().id), "quantity": 1}],
        },
        format="json",
    )

    assert response.status_code == 400, response.data
    assert "order_kind_mismatch" in str(response.data)
    assert not SalesOrder.objects.filter(customer=customer).exists()


@pytest.mark.parametrize(
    ("order_kind", "make_variant"),
    [
        (SalesOrder.OrderType.STOCK, _preorder_variant),
        (SalesOrder.OrderType.PREORDER, _stock_variant),
    ],
)
def test_add_line_refuses_a_variant_of_the_other_kind(order_kind, make_variant):
    order = _confirmed(order_kind)

    with pytest.raises(BusinessRuleViolationError) as excinfo:
        add_order_line(order=order, variant=make_variant(), quantity=1)

    assert excinfo.value.code == "order_kind_mismatch"
    assert order.lines.count() == 0


def test_add_line_endpoint_refuses_a_variant_of_the_other_kind(api_client):
    api_client.force_authenticate(
        user=create_user(email="kind-lines-admin@example.com", role=UserRole.ADMIN)
    )
    order = _confirmed(SalesOrder.OrderType.STOCK)

    response = api_client.post(
        f"{ORDERS_URL}{order.id}/lines/",
        {"variant_id": str(_preorder_variant().id), "quantity": 1},
        format="json",
    )

    assert response.status_code == 400, response.data
    assert "order_kind_mismatch" in str(response.data)


def test_add_line_takes_a_variant_of_the_orders_kind():
    order = _confirmed(SalesOrder.OrderType.STOCK)

    line = add_order_line(order=order, variant=_stock_variant(), quantity=1)

    assert line.order_id == order.id
    assert line.is_preorder is False
