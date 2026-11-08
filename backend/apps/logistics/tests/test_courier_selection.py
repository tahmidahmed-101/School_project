from __future__ import annotations

from decimal import Decimal

import pytest

from apps.common.exceptions import BusinessRuleViolationError
from apps.logistics.factories import CarrierFactory, ShippingRateFactory, ShippingZoneFactory
from apps.logistics.services.courier_selection import select_courier

pytestmark = pytest.mark.django_db


def test_manual_override_always_wins():
    zone = ShippingZoneFactory()
    cheap = CarrierFactory()
    expensive = CarrierFactory()
    ShippingRateFactory(zone=zone, carrier=cheap, base_charge=Decimal("50.00"))
    ShippingRateFactory(zone=zone, carrier=expensive, base_charge=Decimal("500.00"))

    selection = select_courier(zone=zone, weight=Decimal("1"), override_carrier=expensive)

    assert selection.carrier == expensive
    assert selection.reason == "manual_override"


def test_picks_the_cheapest_carrier_with_a_live_quote():
    zone = ShippingZoneFactory()
    cheap = CarrierFactory()
    expensive = CarrierFactory()
    ShippingRateFactory(zone=zone, carrier=cheap, base_charge=Decimal("50.00"))
    ShippingRateFactory(zone=zone, carrier=expensive, base_charge=Decimal("500.00"))

    selection = select_courier(zone=zone, weight=Decimal("0"))

    assert selection.carrier == cheap
    assert selection.reason == "lowest_cost"
    assert selection.estimated_cost == Decimal("50.00")


def test_skips_inactive_carriers():
    zone = ShippingZoneFactory()
    cheap = CarrierFactory(is_active=False)
    other = CarrierFactory()
    ShippingRateFactory(zone=zone, carrier=cheap, base_charge=Decimal("10.00"))
    ShippingRateFactory(zone=zone, carrier=other, base_charge=Decimal("500.00"))

    selection = select_courier(zone=zone, weight=Decimal("0"))

    assert selection.carrier == other


def test_raises_when_no_carrier_quotes_this_zone():
    zone = ShippingZoneFactory()
    CarrierFactory()

    with pytest.raises(BusinessRuleViolationError):
        select_courier(zone=zone, weight=Decimal("1"))
