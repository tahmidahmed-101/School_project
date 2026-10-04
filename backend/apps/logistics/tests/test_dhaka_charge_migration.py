"""Migration 0014 moves the Dhaka charges seeded by 0010 from 80 / 120 to
70 / 110 on existing installs, without touching rates staff have changed."""

from __future__ import annotations

from decimal import Decimal
from importlib import import_module

import pytest
from django.apps import apps
from django.utils import timezone

from apps.logistics.factories import ShippingRateFactory, ShippingZoneFactory

pytestmark = pytest.mark.django_db

migration = import_module("apps.logistics.migrations.0014_lower_dhaka_delivery_charges")


def _seeded_rate(zone_name: str, charge: str, **overrides):
    """A rate in the flat shape 0010 seeds."""
    values = {
        "base_weight": Decimal("0"),
        "base_charge": Decimal(charge),
        "increment_weight": Decimal("1"),
        "increment_charge": Decimal("0"),
        **overrides,
    }
    return ShippingRateFactory(zone=ShippingZoneFactory(name=zone_name), **values)


def _charge(rate) -> Decimal:
    rate.refresh_from_db()
    return rate.base_charge


def test_seeded_charges_move_to_the_new_values():
    inside = _seeded_rate("Inside Dhaka", "80.00")
    outside = _seeded_rate("Outside Dhaka", "120.00")

    migration.lower_charges(apps, None)

    assert _charge(inside) == Decimal("70.00")
    assert _charge(outside) == Decimal("110.00")


def test_charges_staff_changed_are_left_alone():
    edited_charge = _seeded_rate("Inside Dhaka", "95.00")
    weight_based = _seeded_rate("Outside Dhaka", "120.00", increment_charge=Decimal("15.00"))

    migration.lower_charges(apps, None)

    assert _charge(edited_charge) == Decimal("95.00")
    assert _charge(weight_based) == Decimal("120.00")


def test_other_and_deleted_zones_are_left_alone():
    other_zone = _seeded_rate("Sylhet", "80.00")
    deleted = _seeded_rate("Outside Dhaka", "120.00")
    deleted.zone.deleted_at = timezone.now()
    deleted.zone.save(update_fields=["deleted_at"])

    migration.lower_charges(apps, None)

    assert _charge(other_zone) == Decimal("80.00")
    assert _charge(deleted) == Decimal("120.00")


def test_rerunning_is_harmless_and_reverse_restores_the_old_charges():
    inside = _seeded_rate("Inside Dhaka", "80.00")
    outside = _seeded_rate("Outside Dhaka", "120.00")

    migration.lower_charges(apps, None)
    migration.lower_charges(apps, None)
    assert (_charge(inside), _charge(outside)) == (Decimal("70.00"), Decimal("110.00"))

    migration.restore_charges(apps, None)
    assert (_charge(inside), _charge(outside)) == (Decimal("80.00"), Decimal("120.00"))
