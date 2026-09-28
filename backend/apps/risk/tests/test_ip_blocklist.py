from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.common.exceptions import BusinessRuleViolationError
from apps.risk.services.ip_blocklist import block_ip, is_blocked, unblock_ip

pytestmark = pytest.mark.django_db


def test_block_and_is_blocked():
    block_ip("203.0.113.5", reason="Checkout abuse")

    assert is_blocked("203.0.113.5") is True
    assert is_blocked("203.0.113.6") is False


def test_expired_block_is_not_active():
    block_ip("203.0.113.5", reason="temp", expires_at=timezone.now() - timedelta(hours=1))

    assert is_blocked("203.0.113.5") is False


def test_reblocking_updates_reason_and_expiry():
    block_ip("203.0.113.5", reason="first")
    block_ip("203.0.113.5", reason="second", expires_at=None)

    assert is_blocked("203.0.113.5") is True


def test_unblock_removes_the_entry():
    block_ip("203.0.113.5", reason="temp")
    unblock_ip("203.0.113.5")

    assert is_blocked("203.0.113.5") is False


def test_unblock_unknown_ip_raises():
    with pytest.raises(BusinessRuleViolationError):
        unblock_ip("203.0.113.5")


def test_block_requires_reason():
    with pytest.raises(BusinessRuleViolationError):
        block_ip("203.0.113.5", reason="")
