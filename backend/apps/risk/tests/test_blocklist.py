from __future__ import annotations

import pytest

from apps.accounts.factories import StaffUserFactory
from apps.common.exceptions import BusinessRuleViolationError
from apps.orders.factories import ShipmentFactory
from apps.orders.models import Shipment
from apps.risk.models import PhoneBlock
from apps.risk.services.blocklist import (
    active_block,
    auto_flag,
    block_phone,
    is_blocked,
    lift_block,
)
from apps.risk.services.phone_profile import rebuild_phone_profile

pytestmark = pytest.mark.django_db


def test_block_phone_requires_a_valid_bd_mobile():
    with pytest.raises(BusinessRuleViolationError):
        block_phone("123", reason="bad number")


def test_block_phone_requires_a_reason():
    with pytest.raises(BusinessRuleViolationError):
        block_phone("01711223344", reason="  ")


def test_block_and_is_blocked():
    block_phone("01711223344", reason="Refused three parcels", strength=PhoneBlock.Strength.BLOCKED)

    assert is_blocked("01711223344") is True
    assert is_blocked("+8801711223344") is True  # normalises before comparing


def test_advance_only_block_is_not_a_full_refusal():
    block_phone("01711223344", reason="thin history", strength=PhoneBlock.Strength.ADVANCE_ONLY)

    assert is_blocked("01711223344") is False
    assert active_block("01711223344") is not None


def test_reblocking_reopens_a_lifted_block():
    staff = StaffUserFactory()
    block_phone("01711223344", reason="first", strength=PhoneBlock.Strength.BLOCKED)
    lift_block("01711223344", reason="resolved", staff=staff)
    assert active_block("01711223344") is None

    block_phone("01711223344", reason="again", strength=PhoneBlock.Strength.BLOCKED)

    block = active_block("01711223344")
    assert block is not None
    assert block.reason == "again"


def test_lift_block_on_unknown_number_raises():
    with pytest.raises(BusinessRuleViolationError):
        lift_block("01711223344")


def test_auto_flag_proposes_a_block_for_a_bad_history():
    phone = "01711223344"
    for _ in range(4):
        ShipmentFactory(recipient_phone=phone, status=Shipment.Status.RETURNED)
    ShipmentFactory(recipient_phone=phone, status=Shipment.Status.DELIVERED)
    rebuild_phone_profile(phone)

    flagged = auto_flag()

    assert len(flagged) == 1
    assert flagged[0].phone_number == phone
    assert flagged[0].origin == PhoneBlock.Origin.AUTOMATIC


def test_auto_flag_skips_a_number_with_an_existing_lifted_block():
    phone = "01711223344"
    for _ in range(4):
        ShipmentFactory(recipient_phone=phone, status=Shipment.Status.RETURNED)
    ShipmentFactory(recipient_phone=phone, status=Shipment.Status.DELIVERED)
    rebuild_phone_profile(phone)
    staff = StaffUserFactory()
    block_phone(phone, reason="manual", strength=PhoneBlock.Strength.ADVANCE_ONLY)
    lift_block(phone, staff=staff)

    assert auto_flag() == []
