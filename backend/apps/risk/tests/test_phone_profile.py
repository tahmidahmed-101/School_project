from __future__ import annotations

from decimal import Decimal

import pytest

from apps.orders.factories import ShipmentFactory
from apps.orders.models import Shipment
from apps.risk.services.phone_profile import (
    MIN_SETTLED_ORDERS,
    normalise_phone,
    phone_risk_features,
    rebuild_phone_profile,
)

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("01711223344", "01711223344"),
        ("+8801711223344", "01711223344"),
        ("8801711223344", "01711223344"),
        ("", ""),
    ],
)
def test_normalise_phone(raw, expected):
    assert normalise_phone(raw) == expected


def test_rebuild_phone_profile_aggregates_shipment_outcomes():
    phone = "01711223344"
    ShipmentFactory(recipient_phone=phone, status=Shipment.Status.DELIVERED)
    ShipmentFactory(recipient_phone=phone, status=Shipment.Status.DELIVERED)
    ShipmentFactory(recipient_phone=phone, status=Shipment.Status.RETURNED)
    ShipmentFactory(recipient_phone=phone, status=Shipment.Status.PENDING)  # not settled

    profile = rebuild_phone_profile(phone)

    assert profile.total_orders == 4
    assert profile.delivered_count == 2
    assert profile.returned_count == 1
    assert profile.settled_orders == 3
    assert profile.success_rate == Decimal("66.67")


def test_rebuild_phone_profile_returns_none_for_unparseable_phone():
    assert rebuild_phone_profile("") is None


def test_phone_risk_features_ignores_thin_history():
    phone = "01711223344"
    for _ in range(MIN_SETTLED_ORDERS - 1):
        ShipmentFactory(recipient_phone=phone, status=Shipment.Status.RETURNED)
    rebuild_phone_profile(phone)

    score, reasons, features = phone_risk_features(phone)

    assert score == Decimal("0.00")
    assert reasons == []
    assert features["phone_history_known"] is True


def test_phone_risk_features_flags_a_high_failure_rate():
    phone = "01711223344"
    for _ in range(4):
        ShipmentFactory(recipient_phone=phone, status=Shipment.Status.RETURNED)
    ShipmentFactory(recipient_phone=phone, status=Shipment.Status.DELIVERED)
    rebuild_phone_profile(phone)

    score, reasons, _ = phone_risk_features(phone)

    assert score == Decimal("35.00")
    assert reasons
