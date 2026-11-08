from __future__ import annotations

from decimal import Decimal

import pytest

from apps.common.exceptions import BusinessRuleViolationError
from apps.logistics.factories import CarrierFactory, ShippingRateFactory, ShippingZoneFactory
from apps.logistics.services.rates import quote_shipping, try_quote_shipping

pytestmark = pytest.mark.django_db


def test_quote_shipping_refuses_when_no_rate_matches():
    zone = ShippingZoneFactory()
    CarrierFactory(is_active=True)

    with pytest.raises(BusinessRuleViolationError) as exc:
        quote_shipping(zone=zone, weight=Decimal("1"))

    assert exc.value.code == "no_shipping_rate"


def test_quote_shipping_refuses_for_a_missing_zone():
    with pytest.raises(BusinessRuleViolationError):
        quote_shipping(zone=None, weight=Decimal("1"))


def test_quote_shipping_returns_the_calculated_charge():
    rate = ShippingRateFactory(
        base_weight=Decimal("1"),
        base_charge=Decimal("60"),
        increment_weight=Decimal("1"),
        increment_charge=Decimal("15"),
    )

    assert quote_shipping(zone=rate.zone, weight=Decimal("1"), carrier=rate.carrier) == Decimal(
        "60"
    )
    assert quote_shipping(zone=rate.zone, weight=Decimal("2.5"), carrier=rate.carrier) == (
        Decimal("60") + 2 * Decimal("15")
    )


def test_try_quote_shipping_returns_none_instead_of_raising():
    zone = ShippingZoneFactory()
    CarrierFactory(is_active=True)

    assert try_quote_shipping(zone=zone, weight=Decimal("1")) is None


def test_try_quote_shipping_returns_none_for_a_missing_zone():
    assert try_quote_shipping(zone=None, weight=Decimal("1")) is None


def test_default_carrier_ignores_inactive_carriers():
    rate = ShippingRateFactory(carrier__is_active=False)

    with pytest.raises(BusinessRuleViolationError):
        quote_shipping(zone=rate.zone, weight=rate.base_weight)
