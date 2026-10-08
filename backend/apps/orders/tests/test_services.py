from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounting.models import TaxRate
from apps.accounts.factories import AddressFactory, CustomerUserFactory
from apps.catalog.factories import BundleItemFactory, ProductVariantFactory
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.selectors.stock import get_stock_item
from apps.inventory.services.stock import record_movement
from apps.logistics.factories import CarrierFactory, ShippingRateFactory, ShippingZoneFactory
from apps.orders.factories import SalesOrderFactory
from apps.orders.models import ReturnRMA, ReturnRMALine, SalesOrder
from apps.orders.services.address_snapshot import build_address_snapshot, snapshot_or_live
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.orders import (
    remove_order_line,
    set_order_status,
    update_order,
    update_order_line,
)
from apps.orders.services.payments import capture_payment
from apps.orders.services.returns import approve_rma, create_rma, grade_rma_line, receive_rma
from apps.orders.services.shipments import create_shipment

pytestmark = pytest.mark.django_db


def _stocked_variant(quantity: int = 20):
    variant = ProductVariantFactory()
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=quantity,
        unit_cost=Decimal("5.00"),
    )
    return variant


def test_full_order_lifecycle_reserves_ships_and_updates_stock():
    customer = CustomerUserFactory()
    variant = _stocked_variant(quantity=20)

    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=5)

    checkout(order=cart)
    stock_item = get_stock_item(variant=variant)
    assert stock_item.quantity_reserved == 5
    assert stock_item.quantity_on_hand == 20

    capture_payment(order=cart, amount=cart.grand_total)
    cart.refresh_from_db()
    assert cart.status == SalesOrder.Status.CONFIRMED

    order_line = cart.lines.get()
    shipment = create_shipment(order=cart, lines=[{"order_line": order_line, "quantity": 5}])

    stock_item.refresh_from_db()
    assert stock_item.quantity_on_hand == 15
    assert stock_item.quantity_reserved == 0
    cart.refresh_from_db()
    assert cart.status == SalesOrder.Status.SHIPPED
    assert shipment.lines.count() == 1


def test_preorder_line_ships_without_a_stock_reservation():
    """checkout() skips reserve_stock/StockReservation for a pre-order line
    (no real inventory to hold yet), so create_shipment must not try to
    release a reservation or post a stock-out movement that was never made —
    that would either crash on a variant with zero stock (insufficient_stock)
    or, worse, silently release/deduct someone else's stock for the SKU."""
    customer = CustomerUserFactory()
    now = timezone.now()
    variant = ProductVariantFactory(
        is_preorder_enabled=True,
        preorder_start_date=now - timedelta(days=1),
        preorder_end_date=now + timedelta(days=1),
    )
    # Deliberately no record_movement — zero stock on hand, as a real
    # not-yet-manufactured pre-order item would be.

    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=3)
    assert cart.lines.first().is_preorder is True

    order = checkout(order=cart)
    assert order.status == SalesOrder.Status.AWAITING_PAYMENT

    capture_payment(order=order, amount=order.grand_total)
    order.refresh_from_db()

    order_line = order.lines.get()
    shipment = create_shipment(order=order, lines=[{"order_line": order_line, "quantity": 3}])

    order.refresh_from_db()
    assert order.status == SalesOrder.Status.SHIPPED
    assert shipment.lines.count() == 1
    stock_item = get_stock_item(variant=variant)
    assert stock_item is None or stock_item.quantity_on_hand == 0


def test_checkout_rejects_empty_cart():
    customer = CustomerUserFactory()
    cart = get_or_create_cart(customer)

    with pytest.raises(BusinessRuleViolationError):
        checkout(order=cart)


def test_checkout_rejects_insufficient_stock():
    customer = CustomerUserFactory()
    variant = _stocked_variant(quantity=2)
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=5)

    with pytest.raises(BusinessRuleViolationError):
        checkout(order=cart)


def test_rma_receive_restocks_sellable_lines_only():
    order = SalesOrderFactory(status=SalesOrder.Status.SHIPPED)
    from apps.orders.factories import SalesOrderLineFactory

    variant = ProductVariantFactory()
    # shipped_quantity is what makes the units returnable — only stock that
    # physically left the building can come back.
    order_line = SalesOrderLineFactory(order=order, variant=variant, quantity=3, shipped_quantity=3)

    rma = create_rma(order=order, lines=[{"order_line": order_line, "quantity": 3}])
    rma = approve_rma(rma=rma)
    line = rma.lines.get()
    grade_rma_line(line=line, condition=ReturnRMALine.Condition.SELLABLE)

    receive_rma(rma=rma)

    stock_item = get_stock_item(variant=variant)
    assert stock_item.quantity_on_hand == 3
    rma.refresh_from_db()
    assert rma.status == ReturnRMA.Status.RECEIVED


def test_rma_receive_does_not_restock_damaged_lines():
    order = SalesOrderFactory(status=SalesOrder.Status.SHIPPED)
    from apps.orders.factories import SalesOrderLineFactory

    variant = ProductVariantFactory()
    order_line = SalesOrderLineFactory(order=order, variant=variant, quantity=2, shipped_quantity=2)

    rma = create_rma(order=order, lines=[{"order_line": order_line, "quantity": 2}])
    rma = approve_rma(rma=rma)
    line = rma.lines.get()
    grade_rma_line(line=line, condition=ReturnRMALine.Condition.DAMAGED)

    receive_rma(rma=rma)

    stock_item = get_stock_item(variant=variant)
    assert stock_item is None


def test_add_line_applies_default_tax_rate_to_totals():
    TaxRate.objects.create(name="Standard", rate_percent=Decimal("10.00"), region="US")
    customer = CustomerUserFactory()
    variant = _stocked_variant(quantity=20)

    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=2)

    line = cart.lines.get()
    assert line.unit_price == Decimal("19.99")
    assert line.tax_amount == Decimal("4.00")
    assert cart.subtotal == Decimal("39.98")
    assert cart.tax_total == Decimal("4.00")
    assert cart.grand_total == Decimal("43.98")


def test_add_line_without_tax_rate_stays_tax_free():
    customer = CustomerUserFactory()
    variant = _stocked_variant(quantity=20)

    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=1)

    line = cart.lines.get()
    assert line.tax_amount == Decimal("0")
    assert cart.grand_total == cart.subtotal


def test_checkout_quotes_shipping_from_zone_and_weight():
    customer = CustomerUserFactory()
    carrier = CarrierFactory()
    zone = ShippingZoneFactory(country_codes=["dhaka"])
    address = AddressFactory(user=customer, city="Dhaka")
    ShippingRateFactory(
        zone=zone,
        carrier=carrier,
        base_weight=Decimal("0"),
        base_charge=Decimal("9.99"),
        increment_weight=Decimal("10"),
        increment_charge=Decimal("5.00"),
    )

    variant = _stocked_variant(quantity=20)
    variant.weight = Decimal("2.000")
    variant.save(update_fields=["weight"])

    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=3)

    checkout(order=cart, shipping_address=address, carrier=carrier)

    cart.refresh_from_db()
    # 6kg total: 1 increment above the 0kg base weight.
    assert cart.shipping_total == Decimal("14.99")
    assert cart.grand_total == cart.subtotal + cart.tax_total + cart.shipping_total


def test_checkout_without_address_charges_no_shipping():
    customer = CustomerUserFactory()
    variant = _stocked_variant(quantity=20)

    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=1)

    checkout(order=cart)

    cart.refresh_from_db()
    assert cart.shipping_total == Decimal("0")


def test_bundle_line_reserves_and_ships_component_stock():
    customer = CustomerUserFactory()

    component_a = ProductVariantFactory()
    component_b = ProductVariantFactory()
    bundle = ProductVariantFactory()
    BundleItemFactory(bundle_variant=bundle, component_variant=component_a, quantity=2)
    BundleItemFactory(bundle_variant=bundle, component_variant=component_b, quantity=1)

    record_movement(
        variant=component_a,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("3.00"),
    )
    record_movement(
        variant=component_b,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("2.00"),
    )

    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=bundle, quantity=2)

    checkout(order=cart)
    stock_a = get_stock_item(variant=component_a)
    stock_b = get_stock_item(variant=component_b)
    assert stock_a.quantity_reserved == 4
    assert stock_b.quantity_reserved == 2

    capture_payment(order=cart, amount=cart.grand_total)
    cart.refresh_from_db()
    order_line = cart.lines.get()
    create_shipment(order=cart, lines=[{"order_line": order_line, "quantity": 2}])

    stock_a.refresh_from_db()
    stock_b.refresh_from_db()
    assert stock_a.quantity_on_hand == 6
    assert stock_a.quantity_reserved == 0
    assert stock_b.quantity_on_hand == 8
    assert stock_b.quantity_reserved == 0


def test_cancel_confirmed_order_releases_reservations():
    customer = CustomerUserFactory()
    variant = _stocked_variant(quantity=10)

    from apps.orders.models import StockReservation
    from apps.orders.services.orders import cancel_order

    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=4)
    checkout(order=cart)
    capture_payment(order=cart, amount=cart.grand_total)
    cart.refresh_from_db()
    assert cart.status == SalesOrder.Status.CONFIRMED

    cancel_order(order=cart, actor=None)

    stock_item = get_stock_item(variant=variant)
    assert stock_item.quantity_on_hand == 10
    assert stock_item.quantity_reserved == 0
    assert not StockReservation.objects.filter(
        status=StockReservation.Status.ACTIVE, order_line__order=cart
    ).exists()
    cart.refresh_from_db()
    assert cart.status == SalesOrder.Status.CANCELLED


def test_cancel_rejects_shipped_order():
    customer = CustomerUserFactory()
    variant = _stocked_variant(quantity=10)

    from apps.orders.services.orders import cancel_order

    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=2)
    checkout(order=cart)
    capture_payment(order=cart, amount=cart.grand_total)
    cart.refresh_from_db()
    order_line = cart.lines.get()
    create_shipment(order=cart, lines=[{"order_line": order_line, "quantity": 2}])

    with pytest.raises(BusinessRuleViolationError):
        cancel_order(order=cart, actor=None)


def test_cart_line_charges_the_discount_price():
    variant = _stocked_variant()
    variant.price = Decimal("200.00")
    variant.discount_price = Decimal("150.00")
    variant.save(update_fields=["price", "discount_price"])

    cart = get_or_create_cart(CustomerUserFactory())
    line = add_line(order=cart, variant=variant, quantity=2)

    assert line.unit_price == Decimal("150.00")


def test_cart_line_ignores_a_discount_that_is_not_below_the_price():
    variant = _stocked_variant()
    variant.price = Decimal("200.00")
    variant.discount_price = Decimal("250.00")
    variant.save(update_fields=["price", "discount_price"])

    cart = get_or_create_cart(CustomerUserFactory())
    line = add_line(order=cart, variant=variant, quantity=1)

    assert line.unit_price == Decimal("200.00")


def _checked_out_order(quantity: int = 5, stock: int = 20):
    customer = CustomerUserFactory()
    variant = _stocked_variant(quantity=stock)
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=quantity)
    checkout(order=cart)
    cart.refresh_from_db()
    return cart, variant


def test_update_order_rewrites_the_snapshot_the_invoice_reads():
    customer = CustomerUserFactory()
    address = AddressFactory(user=customer, full_name="Old Name", city="Dhaka")
    order = SalesOrderFactory(customer=customer, shipping_address=address)
    order.shipping_address_snapshot = build_address_snapshot(address)
    order.save(update_fields=["shipping_address_snapshot"])

    update_order(order=order, data={"full_name": "New Name", "line1": "New Road 7"})

    order.refresh_from_db()
    assert snapshot_or_live(order)["full_name"] == "New Name"
    assert snapshot_or_live(order)["line1"] == "New Road 7"
    # The customer's own address book is untouched.
    address.refresh_from_db()
    assert address.full_name == "Old Name"


def test_choosing_a_different_address_reseeds_the_snapshot():
    customer = CustomerUserFactory()
    first = AddressFactory(user=customer, full_name="First")
    second = AddressFactory(user=customer, full_name="Second")
    order = SalesOrderFactory(customer=customer, shipping_address=first)
    order.shipping_address_snapshot = build_address_snapshot(first)
    order.save(update_fields=["shipping_address_snapshot"])

    update_order(order=order, data={"shipping_address": second})

    order.refresh_from_db()
    assert snapshot_or_live(order)["full_name"] == "Second"


def test_update_order_line_re_reserves_stock_to_the_new_quantity():
    order, variant = _checked_out_order(quantity=5, stock=20)
    assert get_stock_item(variant=variant).quantity_reserved == 5

    line = order.lines.first()
    update_order_line(line=line, quantity=8)

    assert get_stock_item(variant=variant).quantity_reserved == 8
    order.refresh_from_db()
    line.refresh_from_db()
    assert line.quantity == 8
    assert order.subtotal == line.unit_price * 8


def test_update_order_line_refuses_more_than_available_stock():
    order, variant = _checked_out_order(quantity=5, stock=6)
    line = order.lines.first()

    with pytest.raises(BusinessRuleViolationError):
        update_order_line(line=line, quantity=50)

    line.refresh_from_db()
    assert line.quantity == 5
    assert get_stock_item(variant=variant).quantity_reserved == 5


def test_line_edits_are_refused_once_anything_has_shipped():
    order, _variant = _checked_out_order(quantity=5, stock=20)
    capture_payment(order=order, amount=order.grand_total, method="manual")
    order.refresh_from_db()
    line = order.lines.first()
    create_shipment(order=order, lines=[{"order_line": line, "quantity": 2}])

    line.refresh_from_db()
    with pytest.raises(BusinessRuleViolationError) as exc:
        update_order_line(line=line, quantity=4)
    assert exc.value.code == "line_shipped"


def test_remove_order_line_releases_its_hold():
    order, variant = _checked_out_order(quantity=5, stock=20)
    second_variant = _stocked_variant(quantity=10)
    add_line(
        order=SalesOrderFactory(customer=order.customer),
        variant=second_variant,
        quantity=1,
    )
    extra = order.lines.create(
        variant=second_variant,
        quantity=1,
        unit_price=Decimal("1.00"),
        product_name=second_variant.product.name,
        variant_sku=second_variant.sku,
    )

    remove_order_line(line=extra)

    assert not order.lines.filter(pk=extra.pk).exists()
    assert get_stock_item(variant=variant).quantity_reserved == 5


def test_remove_order_line_refuses_to_empty_the_order():
    order, _ = _checked_out_order(quantity=5, stock=20)
    with pytest.raises(BusinessRuleViolationError) as exc:
        remove_order_line(line=order.lines.first())
    assert exc.value.code == "last_line"


def test_set_order_status_cancels_through_the_cancel_path():
    order, variant = _checked_out_order(quantity=5, stock=20)

    set_order_status(order=order, new_status=SalesOrder.Status.CANCELLED)

    order.refresh_from_db()
    assert order.status == SalesOrder.Status.CANCELLED
    # Reservations released rather than stranded.
    assert get_stock_item(variant=variant).quantity_reserved == 0


def test_set_order_status_refuses_to_reopen_a_cancelled_order():
    order, _ = _checked_out_order(quantity=5, stock=20)
    set_order_status(order=order, new_status=SalesOrder.Status.CANCELLED)

    with pytest.raises(BusinessRuleViolationError) as exc:
        set_order_status(order=order, new_status=SalesOrder.Status.CONFIRMED)
    assert exc.value.code == "order_cancelled"


def test_set_order_status_moves_forward_directly():
    order, _ = _checked_out_order(quantity=5, stock=20)
    # Closing skips nothing only once the order is paid for; unpaid orders are cancelled.
    SalesOrder.objects.filter(pk=order.pk).update(status=SalesOrder.Status.CONFIRMED)

    set_order_status(order=order, new_status=SalesOrder.Status.CLOSED)

    order.refresh_from_db()
    assert order.status == SalesOrder.Status.CLOSED


def test_set_order_status_refuses_delivered_without_shipments():
    order, _ = _checked_out_order(quantity=5, stock=20)
    previous = order.status

    with pytest.raises(BusinessRuleViolationError) as exc:
        set_order_status(order=order, new_status=SalesOrder.Status.DELIVERED)

    assert exc.value.code == "shipments_incomplete"
    order.refresh_from_db()
    assert order.status == previous
