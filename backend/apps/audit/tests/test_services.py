from __future__ import annotations

import pytest

from apps.accounts.tests.helpers import create_user
from apps.audit.models import AuditLog, LoginHistory
from apps.audit.services.audit import log_action, record_login_attempt

pytestmark = pytest.mark.django_db


def test_log_action_creates_audit_log_with_metadata():
    actor = create_user(email="audit-actor@example.com")

    entry = log_action(
        actor=actor,
        action="user.updated",
        target_type="User",
        target_id=actor.id,
        metadata={"field": "first_name"},
        ip_address="203.0.113.1",
        user_agent="pytest-agent",
    )

    assert AuditLog.objects.count() == 1
    assert entry.actor == actor
    assert entry.target_id == str(actor.id)
    assert entry.metadata == {"field": "first_name"}
    assert entry.ip_address == "203.0.113.1"


def test_log_action_without_request_context_defaults_ip_to_none():
    entry = log_action(action="system.startup")

    assert entry.actor is None
    assert entry.ip_address is None
    assert entry.user_agent == ""


def test_record_login_attempt_tracks_success_and_failure():
    user = create_user(email="login-history@example.com")

    success = record_login_attempt(
        user=user, email=user.email, was_successful=True, ip_address="203.0.113.5"
    )
    failure = record_login_attempt(user=None, email="unknown@example.com", was_successful=False)

    assert LoginHistory.objects.count() == 2
    assert success.was_successful is True
    assert failure.user is None
    assert failure.was_successful is False
