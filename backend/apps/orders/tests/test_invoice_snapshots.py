from __future__ import annotations

from decimal import Decimal

import pytest

from apps.accounts.factories import AddressFactory
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductVariantFactory
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.logistics.factories import ShippingRateFactory
from apps.orders.services.address_snapshot import build_address_snapshot
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.invoice_document import build_invoice_context

pytestmark = pytest.mark.django_db


def _checked_out_order():
    customer = create_user(email="snapshot-buyer@example.com")
    address = AddressFactory(user=customer, city="Dhaka")
    variant = ProductVariantFactory(price=Decimal("100.00"))
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=5,
        unit_cost=Decimal("50.00"),
    )
    ShippingRateFactory(zone__country_codes=["dhaka"])
    order = get_or_create_cart(customer)
    add_line(order=order, variant=variant, quantity=1)
    checkout(order=order, shipping_address=address)
    order.refresh_from_db()
    return order, variant, address


def test_invoice_keeps_the_product_name_it_was_sold_under():
    order, variant, _ = _checked_out_order()
    sold_as = variant.product.name

    variant.product.name = "Renamed After Sale"
    variant.product.save(update_fields=["name"])

    assert build_invoice_context(order)["lines"][0]["name"] == sold_as


def test_invoice_keeps_the_sku_it_was_sold_under():
    order, variant, _ = _checked_out_order()
    sold_sku = variant.sku

    variant.sku = "REISSUED-SKU"
    variant.save(update_fields=["sku"])

    assert build_invoice_context(order)["lines"][0]["sku"] == sold_sku


def test_ship_to_block_survives_the_address_being_deleted():
    order, _, address = _checked_out_order()
    expected_name = address.full_name

    address.delete()
    order.refresh_from_db()

    context = build_invoice_context(order)
    assert order.shipping_address_id is None
    assert context["ship_name"] == expected_name
    assert context["ship_lines"]


def test_snapshot_of_none_is_empty():
    assert build_address_snapshot(None) == {}
