from __future__ import annotations

from decimal import Decimal

import pytest

from apps.common.exceptions import BusinessRuleViolationError
from apps.logistics.factories import (
    CarrierFactory,
    ShippingRateFactory,
    ShippingZoneFactory,
)
from apps.logistics.services.rates import (
    calculate_shipping_rate,
    create_rate,
)

pytestmark = pytest.mark.django_db


def test_calculate_shipping_rate_charges_base_within_the_base_weight():
    zone = ShippingZoneFactory()
    carrier = CarrierFactory()
    ShippingRateFactory(
        zone=zone,
        carrier=carrier,
        base_weight=Decimal("1"),
        base_charge=Decimal("60"),
        increment_weight=Decimal("1"),
        increment_charge=Decimal("15"),
    )

    assert calculate_shipping_rate(
        kind="stock", zone=zone, carrier=carrier, weight=Decimal("0.5")
    ) == Decimal("60")
    assert calculate_shipping_rate(
        kind="stock", zone=zone, carrier=carrier, weight=Decimal("1")
    ) == Decimal("60")


def test_calculate_shipping_rate_charges_per_increment_above_base_weight():
    zone = ShippingZoneFactory()
    carrier = CarrierFactory()
    ShippingRateFactory(
        zone=zone,
        carrier=carrier,
        base_weight=Decimal("1"),
        base_charge=Decimal("60"),
        increment_weight=Decimal("1"),
        increment_charge=Decimal("15"),
    )

    # 1.2kg over base rounds up to a full increment, same as 2kg over.
    assert calculate_shipping_rate(
        kind="stock", zone=zone, carrier=carrier, weight=Decimal("2.2")
    ) == Decimal("60") + 2 * Decimal("15")
    assert calculate_shipping_rate(
        kind="stock", zone=zone, carrier=carrier, weight=Decimal("3")
    ) == Decimal("60") + 2 * Decimal("15")


def test_calculate_shipping_rate_raises_when_no_rate_configured():
    zone = ShippingZoneFactory()
    carrier = CarrierFactory()

    with pytest.raises(BusinessRuleViolationError):
        calculate_shipping_rate(kind="stock", zone=zone, carrier=carrier, weight=Decimal("3"))


def test_create_rate_rejects_a_non_positive_increment_weight():
    zone = ShippingZoneFactory()
    carrier = CarrierFactory()

    with pytest.raises(BusinessRuleViolationError):
        create_rate(
            zone=zone,
            carrier=carrier,
            base_weight=Decimal("0"),
            base_charge=Decimal("60"),
            increment_weight=Decimal("0"),
            increment_charge=Decimal("15"),
        )


def test_create_rate_rejects_a_duplicate_zone_carrier_pair():
    rate = ShippingRateFactory()

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_rate(
            zone=rate.zone,
            carrier=rate.carrier,
            base_weight=Decimal("0"),
            base_charge=Decimal("60"),
            increment_weight=Decimal("1"),
            increment_charge=Decimal("15"),
        )
    assert exc.value.code == "rate_exists"
