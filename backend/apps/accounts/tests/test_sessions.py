from __future__ import annotations

import pytest
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

from apps.accounts.services.authentication import issue_tokens
from apps.accounts.services.sessions import revoke_other_sessions, revoke_session
from apps.accounts.tests.helpers import create_user
from apps.common.exceptions import BusinessRuleViolationError

pytestmark = pytest.mark.django_db


def test_login_without_remember_me_uses_default_lifetime(api_client):
    user = create_user(email="session-default@example.com", password="StrongPass123!")

    response = api_client.post(
        "/api/v1/customer/auth/login/",
        {"email": user.email, "password": "StrongPass123!"},
        format="json",
    )

    assert response.status_code == 200
    outstanding = OutstandingToken.objects.get(user=user)
    lifetime = outstanding.expires_at - outstanding.created_at
    assert lifetime.days < 7


def test_login_with_remember_me_extends_refresh_lifetime(api_client):
    user = create_user(email="session-remember@example.com", password="StrongPass123!")

    response = api_client.post(
        "/api/v1/customer/auth/login/",
        {"email": user.email, "password": "StrongPass123!", "remember_me": True},
        format="json",
    )

    assert response.status_code == 200
    outstanding = OutstandingToken.objects.get(user=user)
    lifetime = outstanding.expires_at - outstanding.created_at
    assert lifetime.days >= 29


def test_session_list_and_revoke_flow(api_client):
    user = create_user(email="session-list@example.com", password="StrongPass123!")
    issue_tokens(user)
    issue_tokens(user)
    api_client.force_authenticate(user=user)

    response = api_client.get("/api/v1/customer/sessions/")

    assert response.status_code == 200
    assert len(response.data["data"]) == 2

    session_id = response.data["data"][0]["id"]
    revoke_response = api_client.post(f"/api/v1/customer/sessions/{session_id}/revoke/")

    assert revoke_response.status_code == 204

    response = api_client.get("/api/v1/customer/sessions/")
    assert len(response.data["data"]) == 1


def test_revoke_session_raises_for_unknown_session():
    user = create_user(email="session-revoke-missing@example.com")

    with pytest.raises(BusinessRuleViolationError) as exc:
        revoke_session(user=user, session_id=999999)

    assert exc.value.code == "session_not_found"


def test_revoke_other_sessions_keeps_current_token():
    user = create_user(email="session-revoke-others@example.com")
    current = issue_tokens(user)
    issue_tokens(user)
    issue_tokens(user)

    revoked = revoke_other_sessions(user=user, current_refresh_token=current["refresh"])

    assert revoked == 2
    from apps.accounts.selectors.sessions import active_sessions_for_user

    assert active_sessions_for_user(user).count() == 1
