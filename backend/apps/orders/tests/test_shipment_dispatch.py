from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

import pytest

from apps.accounts.factories import AddressFactory
from apps.catalog.factories import ProductVariantFactory
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.logistics.factories import CarrierFactory, ShippingRateFactory, ShippingZoneFactory
from apps.orders.factories import SalesOrderFactory, SalesOrderLineFactory, ShipmentFactory
from apps.orders.models import SalesOrder, Shipment
from apps.orders.services.checkout import checkout
from apps.orders.services.payments import capture_payment
from apps.orders.services.shipments import (
    can_advance_shipment_status,
    create_shipment,
    dispatch_to_courier,
    update_shipment_status,
)
from apps.risk.models import PhoneRiskProfile

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


def _ready_shipment(*, dispatch_carrier=None):
    """A shipped, undispatched shipment with a resolvable delivery zone: a
    catch-all zone (no keywords) plus a rate for at least one active carrier,
    so `checkout` can quote it."""
    zone = ShippingZoneFactory()
    # Deliberately pricier than any carrier a test adds on top of this, so it
    # never wins an auto-selection it isn't the subject of.
    ShippingRateFactory(
        zone=zone, carrier=dispatch_carrier or CarrierFactory(), base_charge=Decimal("999.00")
    )

    address = AddressFactory(phone="01711223344")
    variant = _stocked_variant()
    order = SalesOrderFactory(customer=address.user)
    line = SalesOrderLineFactory(order=order, variant=variant, quantity=1)

    checkout(order=order, shipping_address=address)
    order.refresh_from_db()
    capture_payment(order=order, amount=order.grand_total)
    order.refresh_from_db()
    return zone, create_shipment(
        order=order, lines=[{"order_line": line, "quantity": 1}], carrier=dispatch_carrier
    )


def test_create_shipment_denormalises_recipient_phone():
    _, shipment = _ready_shipment()
    assert shipment.recipient_phone == "01711223344"


def test_dispatch_uses_the_assigned_carrier_when_present():
    carrier = CarrierFactory()
    _, shipment = _ready_shipment(dispatch_carrier=carrier)

    with patch("apps.orders.services.shipments.get_gateway_for_carrier") as get_gateway:
        get_gateway.return_value.create_consignment.return_value = {
            "consignment_id": "CID-1",
            "status": Shipment.Status.SHIPPED,
        }
        dispatch_to_courier(shipment=shipment)

    get_gateway.assert_called_once_with(carrier)
    shipment.refresh_from_db()
    assert shipment.tracking_number == "CID-1"


def test_dispatch_auto_selects_cheapest_carrier_when_none_assigned():
    zone, shipment = _ready_shipment()
    cheap = CarrierFactory()
    expensive = CarrierFactory()
    ShippingRateFactory(zone=zone, carrier=cheap, base_charge=Decimal("50.00"))
    ShippingRateFactory(zone=zone, carrier=expensive, base_charge=Decimal("500.00"))

    with patch("apps.orders.services.shipments.get_gateway_for_carrier") as get_gateway:
        get_gateway.return_value.create_consignment.return_value = {
            "consignment_id": "CID-2",
            "status": Shipment.Status.SHIPPED,
        }
        dispatch_to_courier(shipment=shipment)

    shipment.refresh_from_db()
    assert shipment.carrier_id == cheap.id


def test_dispatch_raises_when_order_has_no_shipping_address():
    order = SalesOrderFactory(status=SalesOrder.Status.SHIPPED)
    shipment = ShipmentFactory(order=order, carrier=None)

    with pytest.raises(BusinessRuleViolationError):
        dispatch_to_courier(shipment=shipment)


def test_can_advance_shipment_status_blocks_regression():
    forward = Shipment.Status
    assert can_advance_shipment_status(forward.OUT_FOR_DELIVERY, forward.SHIPPED) is False
    assert can_advance_shipment_status(forward.SHIPPED, forward.IN_TRANSIT) is True
    assert can_advance_shipment_status(forward.PENDING, forward.DELIVERED) is True


def test_terminal_status_rebuilds_the_phone_risk_profile():
    _, shipment = _ready_shipment()
    assert shipment.recipient_phone

    update_shipment_status(shipment=shipment, status=Shipment.Status.DELIVERED)

    profile = PhoneRiskProfile.objects.get(phone_number=shipment.recipient_phone)
    assert profile.total_orders == 1
    assert profile.delivered_count == 1
    assert profile.success_rate == Decimal("100.00")
