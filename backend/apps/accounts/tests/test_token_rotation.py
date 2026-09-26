"""Refresh-token rotation.

The refresh endpoint used to construct a token by hand and hand back only a
new access token, which quietly disabled the configured rotation: one stolen
refresh token stayed valid for its whole lifetime and could be replayed
indefinitely.
"""

from __future__ import annotations

import pytest
from django.conf import settings
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.utils import aware_utcnow, datetime_from_epoch

from apps.accounts.factories import CustomerUserFactory
from apps.accounts.services import authentication

pytestmark = pytest.mark.django_db

REFRESH_URL = "/api/v1/customer/auth/refresh/"
COOKIE_NAME = settings.REFRESH_COOKIE_NAME


def _refresh(api_client, refresh_token):
    api_client.cookies[COOKIE_NAME] = refresh_token
    return api_client.post(REFRESH_URL, format="json")


def test_refresh_returns_a_rotated_refresh_token_cookie(api_client):
    user = CustomerUserFactory()
    tokens = authentication.issue_tokens(user)

    response = _refresh(api_client, tokens["refresh"])

    assert response.status_code == 200
    assert response.data["data"]["access"]
    assert "refresh" not in response.data["data"]
    rotated = response.cookies[COOKIE_NAME].value
    assert rotated and rotated != tokens["refresh"]


def test_the_old_refresh_token_stops_working_after_rotation(api_client):
    user = CustomerUserFactory()
    tokens = authentication.issue_tokens(user)

    first = _refresh(api_client, tokens["refresh"])
    assert first.status_code == 200
    rotated = first.cookies[COOKIE_NAME].value

    replayed = _refresh(api_client, tokens["refresh"])
    assert replayed.status_code == 401

    # The rotated token issued in its place still works.
    followup = _refresh(api_client, rotated)
    assert followup.status_code == 200


def test_the_consumed_refresh_token_is_blacklisted(api_client):
    user = CustomerUserFactory()
    tokens = authentication.issue_tokens(user)
    original_jti = RefreshToken(tokens["refresh"])["jti"]

    _refresh(api_client, tokens["refresh"])

    assert BlacklistedToken.objects.filter(token__jti=original_jti).exists()


def test_the_rotated_token_stays_listed_as_an_active_session(api_client):
    """Rotation must not make the session vanish from "manage your devices",
    which would leave the user unable to revoke it."""
    user = CustomerUserFactory()
    tokens = authentication.issue_tokens(user)

    response = _refresh(api_client, tokens["refresh"])
    rotated_jti = RefreshToken(response.cookies[COOKIE_NAME].value)["jti"]

    outstanding = OutstandingToken.objects.get(jti=rotated_jti)
    assert outstanding.user_id == user.id
    assert not BlacklistedToken.objects.filter(token__jti=rotated_jti).exists()


def test_rotation_does_not_extend_a_remember_me_session():
    """A 30-day remember_me token must not be renewable into a perpetual
    session — the rotated token inherits the original's expiry."""
    user = CustomerUserFactory()
    tokens = authentication.issue_tokens(user, remember_me=True)
    original_exp = RefreshToken(tokens["refresh"])["exp"]

    rotated = authentication.rotate_refresh_token(tokens["refresh"])

    assert RefreshToken(rotated["refresh"])["exp"] == original_exp
    # Sanity check that this really is the long-lived variant.
    remaining = datetime_from_epoch(original_exp) - aware_utcnow()
    assert remaining > settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]


def test_refresh_rejects_a_garbage_token(api_client):
    response = _refresh(api_client, "not-a-token")
    assert response.status_code == 401


def test_refresh_without_a_cookie_is_rejected(api_client):
    response = api_client.post(REFRESH_URL, format="json")
    assert response.status_code == 401


def test_refresh_rejects_a_token_already_used_for_logout(api_client):
    user = CustomerUserFactory()
    tokens = authentication.issue_tokens(user)
    authentication.logout_refresh_token(tokens["refresh"])

    response = _refresh(api_client, tokens["refresh"])
    assert response.status_code == 401
