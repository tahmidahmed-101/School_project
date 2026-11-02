from __future__ import annotations

from decimal import Decimal

import pytest

from apps.accounts.factories import AddressFactory, CustomerUserFactory
from apps.catalog.factories import ProductVariantFactory
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.logistics.factories import CarrierFactory, ShippingRateFactory, ShippingZoneFactory
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.risk.services.blocklist import block_phone
from apps.risk.services.ip_blocklist import block_ip

pytestmark = pytest.mark.django_db


def _cart_ready_for_checkout(customer):
    variant = ProductVariantFactory()
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=5,
        unit_cost=Decimal("10.00"),
    )
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=1)
    return cart


def test_checkout_refuses_a_blocked_ip():
    customer = CustomerUserFactory()
    cart = _cart_ready_for_checkout(customer)
    block_ip("203.0.113.9", reason="checkout abuse")

    with pytest.raises(BusinessRuleViolationError) as exc:
        checkout(order=cart, ip_address="203.0.113.9")

    assert exc.value.code == "ip_blocked"


def test_checkout_refuses_a_fully_blocked_phone():
    from apps.risk.models import PhoneBlock

    customer = CustomerUserFactory()
    cart = _cart_ready_for_checkout(customer)
    address = AddressFactory(user=customer, phone="01711223344")
    block_phone(
        "01711223344",
        reason="refused delivery repeatedly",
        strength=PhoneBlock.Strength.BLOCKED,
    )

    with pytest.raises(BusinessRuleViolationError) as exc:
        checkout(order=cart, shipping_address=address)

    assert exc.value.code == "phone_blocked"


def test_checkout_allows_an_advance_only_blocked_phone():
    from apps.risk.models import PhoneBlock

    zone = ShippingZoneFactory()
    ShippingRateFactory(zone=zone, carrier=CarrierFactory())

    customer = CustomerUserFactory()
    cart = _cart_ready_for_checkout(customer)
    address = AddressFactory(user=customer, phone="01711223344")
    block_phone("01711223344", reason="thin history", strength=PhoneBlock.Strength.ADVANCE_ONLY)

    # Should not raise: advance-only is a payment-method decision, not a checkout refusal.
    checkout(order=cart, shipping_address=address)


def _checked_out_to(phone):
    zone = ShippingZoneFactory()
    ShippingRateFactory(zone=zone, carrier=CarrierFactory())
    customer = CustomerUserFactory()
    cart = _cart_ready_for_checkout(customer)
    address = AddressFactory(user=customer, phone=phone)
    return checkout(order=cart, shipping_address=address)


def test_an_advance_only_phone_cannot_pay_cash_on_delivery():
    from apps.orders.constants import PaymentMethodKey
    from apps.orders.models import SalesOrder
    from apps.orders.services.payments import record_payment_due
    from apps.risk.models import PhoneBlock

    block_phone(
        "01711223344", reason="returned two parcels", strength=PhoneBlock.Strength.ADVANCE_ONLY
    )
    order = _checked_out_to("01711223344")

    with pytest.raises(BusinessRuleViolationError) as exc:
        record_payment_due(order=order, method=PaymentMethodKey.COD)
    assert exc.value.code == "advance_payment_required"

    record_payment_due(order=order, method=PaymentMethodKey.BKASH)
    order.refresh_from_db()
    assert order.status == SalesOrder.Status.AWAITING_PAYMENT


def test_a_lifted_advance_only_block_allows_cash_on_delivery_again():
    from apps.orders.constants import PaymentMethodKey
    from apps.orders.models import SalesOrder
    from apps.orders.services.payments import record_payment_due
    from apps.risk.models import PhoneBlock
    from apps.risk.services.blocklist import lift_block

    block_phone(
        "01711223344", reason="returned two parcels", strength=PhoneBlock.Strength.ADVANCE_ONLY
    )
    lift_block("01711223344", reason="called and confirmed")
    order = _checked_out_to("01711223344")

    record_payment_due(order=order, method=PaymentMethodKey.COD)
    order.refresh_from_db()
    assert order.status == SalesOrder.Status.CONFIRMED


def test_checkout_refuses_a_fully_blocked_contact_phone():
    from apps.risk.models import PhoneBlock

    customer = CustomerUserFactory()
    cart = _cart_ready_for_checkout(customer)
    cart.contact_phone = "01799887766"
    cart.save(update_fields=["contact_phone"])
    address = AddressFactory(user=customer, phone="01711223344")
    block_phone("01799887766", reason="fraud", strength=PhoneBlock.Strength.BLOCKED)

    with pytest.raises(BusinessRuleViolationError) as exc:
        checkout(order=cart, shipping_address=address)

    assert exc.value.code == "phone_blocked"
