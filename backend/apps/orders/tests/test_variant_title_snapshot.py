"""An order line keeps the option values it was sold with, whatever the
product's options are renamed to afterwards."""

from __future__ import annotations

from decimal import Decimal

import pytest

from api.v1.admin.orders.serializers import AdminSalesOrderLineSerializer
from api.v1.customer.orders.serializers import OrderHistoryLineSerializer
from apps.accounts.factories import AdminUserFactory
from apps.catalog.factories import CategoryFactory, ProductVariantFactory
from apps.catalog.selectors.options import product_options
from apps.catalog.services.options import set_product_options
from apps.catalog.services.products import create_product
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.orders.factories import SalesOrderFactory, SalesOrderLineFactory
from apps.orders.models import SalesOrder
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.invoice_document import build_invoice_context
from apps.orders.services.orders import add_order_line
from apps.orders.tests.test_public_checkout_api import (
    GUEST_CHECKOUT_URL,
    _dhaka_delivery,
    _minimal_payload,
)

pytestmark = pytest.mark.django_db


def _variant():
    product = create_product(
        category=CategoryFactory(),
        name="Panjabi",
        price=Decimal("1500.00"),
        options=[{"name": "Colour", "values": ["Navy"]}, {"name": "Size", "values": ["L"]}],
    )
    variant = product.variants.get()
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("500.00"),
    )
    return variant


def _rename_navy(product, new: str) -> None:
    options = product_options(product)
    options[0]["values"][0]["value"] = new
    set_product_options(product=product, options=options)


def test_cart_line_snapshots_the_title_and_keeps_it_after_a_rename(customer_user):
    variant = _variant()
    line = add_line(order=get_or_create_cart(customer_user), variant=variant, quantity=1)

    _rename_navy(variant.product, "Midnight")

    line.refresh_from_db()
    variant.refresh_from_db()
    assert variant.title == "Midnight / L"
    assert line.variant_title == "Navy / L"
    assert AdminSalesOrderLineSerializer(line).data["variant_title"] == "Navy / L"
    assert OrderHistoryLineSerializer(line).data["variant_title"] == "Navy / L"


def test_staff_added_line_snapshots_the_title():
    variant = _variant()

    line = add_order_line(order=SalesOrderFactory(), variant=variant, quantity=1)

    assert line.variant_title == "Navy / L"


def test_guest_checkout_snapshots_the_title_and_tracking_and_invoice_show_it(api_client):
    variant = _variant()
    _dhaka_delivery()

    response = api_client.post(GUEST_CHECKOUT_URL, _minimal_payload(variant), format="json")

    assert response.status_code == 201, response.data
    assert response.data["data"]["lines"][0]["variant_title"] == "Navy / L"
    order = SalesOrder.objects.get(id=response.data["data"]["id"])
    _rename_navy(variant.product, "Midnight")

    tracked = api_client.post(
        "/api/v1/public/tracking/orders/track/",
        {"order_number": order.order_number, "phone": "+8801711111111"},
        format="json",
    )
    assert tracked.status_code == 200, tracked.data
    assert tracked.data["data"]["items"][0]["variant_title"] == "Navy / L"
    assert build_invoice_context(order)["lines"][0]["variant_title"] == "Navy / L"

    api_client.force_authenticate(user=AdminUserFactory())
    admin = api_client.get(f"/api/v1/admin/orders/{order.id}/")
    assert admin.data["data"]["lines"][0]["variant_title"] == "Navy / L"


def test_a_line_without_a_snapshot_falls_back_to_the_live_title():
    variant = _variant()
    old_line = SalesOrderLineFactory(variant=variant)
    legacy_line = SalesOrderLineFactory(variant=ProductVariantFactory(color="Red", size="M"))
    plain_line = SalesOrderLineFactory()

    assert AdminSalesOrderLineSerializer(old_line).data["variant_title"] == "Navy / L"
    assert AdminSalesOrderLineSerializer(legacy_line).data["variant_title"] == "Red / M"
    assert AdminSalesOrderLineSerializer(plain_line).data["variant_title"] == ""
    history = OrderHistoryLineSerializer(legacy_line).data
    assert (history["variant_title"], history["color"], history["size"]) == ("Red / M", "Red", "M")
