"""Migration 0014 sets every live Dhaka zone to the flat 70 / 110 charges a
fresh install gets from 0010."""

from __future__ import annotations

from decimal import Decimal
from importlib import import_module

import pytest
from django.apps import apps
from django.utils import timezone

from apps.logistics.factories import ShippingRateFactory, ShippingZoneFactory

pytestmark = pytest.mark.django_db

migration = import_module("apps.logistics.migrations.0014_lower_dhaka_delivery_charges")


def _rate(zone_name: str, charge: str, **overrides):
    return ShippingRateFactory(
        zone=ShippingZoneFactory(name=zone_name), base_charge=Decimal(charge), **overrides
    )


def _flat(rate) -> tuple:
    rate.refresh_from_db()
    return (rate.base_charge, rate.base_weight, rate.increment_weight, rate.increment_charge)


def test_dhaka_zones_get_flat_70_and_110():
    inside = _rate("Inside Dhaka", "65.00")
    outside = _rate("Outside Dhaka", "99.00", base_weight=Decimal("2"))

    migration.set_charges(apps, None)

    assert _flat(inside) == (Decimal("70.00"), Decimal("0"), Decimal("1"), Decimal("0"))
    assert _flat(outside) == (Decimal("110.00"), Decimal("0"), Decimal("1"), Decimal("0"))


def test_other_and_deleted_zones_are_left_alone():
    other_zone = _rate("Sylhet", "55.00")
    deleted = _rate("Outside Dhaka", "99.00")
    deleted.zone.deleted_at = timezone.now()
    deleted.zone.save(update_fields=["deleted_at"])

    migration.set_charges(apps, None)

    assert _flat(other_zone)[0] == Decimal("55.00")
    assert _flat(deleted)[0] == Decimal("99.00")


def test_rerunning_is_harmless():
    inside = _rate("Inside Dhaka", "65.00")

    migration.set_charges(apps, None)
    migration.set_charges(apps, None)

    assert _flat(inside)[0] == Decimal("70.00")
