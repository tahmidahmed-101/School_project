from __future__ import annotations

from decimal import Decimal
from io import StringIO

import pytest
from django.core.management import call_command

from apps.logistics.factories import CarrierFactory, ShippingRateFactory, ShippingZoneFactory
from apps.logistics.models import ShippingRate, ShippingZone
from apps.logistics.services.rates import quote_shipping
from apps.orders.models import PaymentMethodSetting
from apps.orders.selectors.payment_methods import payment_methods_list
from apps.orders.services.payment_methods import (
    set_payment_method_enabled,
    set_payment_method_pay_to,
)

pytestmark = pytest.mark.django_db

COMMAND = "split_shared_delivery_and_payment_setup"


def _run(*args) -> str:
    out = StringIO()
    call_command(COMMAND, *args, stdout=out)
    return out.getvalue()


def _shared_setup():
    zone = ShippingZoneFactory(name="Dhaka", country_codes=["dhaka"], is_active=False)
    rates = [
        ShippingRateFactory(
            zone=zone,
            carrier=CarrierFactory(),
            base_weight=Decimal("1.500"),
            base_charge=Decimal(charge),
            increment_weight=Decimal("0.500"),
            increment_charge=Decimal("12.50"),
        )
        for charge in ("70.00", "95.00")
    ]
    set_payment_method_enabled(key="cod", is_enabled=False)
    set_payment_method_pay_to(key="bkash", pay_to="01700000000")
    return zone, rates


def _counts() -> tuple[int, int, int]:
    return (
        ShippingZone.objects.count(),
        ShippingRate.objects.count(),
        PaymentMethodSetting.objects.count(),
    )


def test_dry_run_reports_and_writes_nothing():
    _shared_setup()
    before = _counts()

    out = _run()

    assert "5 row(s) would change. Dry run; nothing written." in out
    assert _counts() == before


def test_apply_gives_the_preorder_half_an_identical_copy():
    zone, rates = _shared_setup()

    assert "5 row(s) changed." in _run("--apply")

    twin = ShippingZone.objects.get(name="Dhaka", kind="preorder")
    assert (twin.country_codes, twin.is_active) == (["dhaka"], False)
    assert ShippingZone.objects.get(pk=zone.pk).kind == "stock"
    for rate in rates:
        copy = ShippingRate.objects.get(zone=twin, carrier=rate.carrier)
        assert copy.kind == "preorder"
        assert (
            copy.base_weight,
            copy.base_charge,
            copy.increment_weight,
            copy.increment_charge,
        ) == (rate.base_weight, rate.base_charge, rate.increment_weight, rate.increment_charge)
        for kind, target in (("stock", zone), ("preorder", twin)):
            assert quote_shipping(
                zone=target, weight=Decimal("2.2"), kind=kind, carrier=rate.carrier
            ) == rate.base_charge + 2 * Decimal("12.50")

    def offered(kind: str) -> dict:
        return {
            row["key"]: (row["is_enabled"], row["pay_to"])
            for row in payment_methods_list(kind=kind)
        }

    assert offered("preorder") == offered("stock")
    assert offered("preorder")["cod"] == (False, "")
    assert offered("preorder")["bkash"] == (True, "01700000000")


def test_a_second_apply_changes_nothing():
    _shared_setup()
    _run("--apply")
    before = _counts()

    assert "0 row(s) changed." in _run("--apply")
    assert "0 row(s) would change" in _run()
    assert _counts() == before


def test_rows_the_preorder_half_already_has_are_left_alone():
    zone, rates = _shared_setup()
    twin = ShippingZoneFactory(name="Dhaka", kind="preorder", country_codes=["gulshan"])
    own = ShippingRateFactory(zone=twin, carrier=rates[0].carrier, base_charge=Decimal("150.00"))
    set_payment_method_enabled(key="cod", is_enabled=True, kind="preorder")

    assert "2 row(s) changed." in _run("--apply")

    twin.refresh_from_db()
    own.refresh_from_db()
    assert twin.country_codes == ["gulshan"]
    assert own.base_charge == Decimal("150.00")
    assert ShippingRate.objects.filter(zone=twin).count() == 2
    assert PaymentMethodSetting.objects.get(key="cod", kind="preorder").is_enabled is True
    assert zone.rates.count() == 2
