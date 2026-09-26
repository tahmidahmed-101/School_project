"""End-to-end check of the HttpOnly-cookie refresh flow: login sets the
cookie and omits refresh from the body, refresh rotates it, logout clears it.
"""

from __future__ import annotations

import pytest
from django.conf import settings

from apps.accounts.tests.helpers import create_user

pytestmark = pytest.mark.django_db

COOKIE_NAME = settings.REFRESH_COOKIE_NAME


def test_login_sets_httponly_refresh_cookie_and_omits_it_from_body(api_client):
    user = create_user(email="cookie-flow@example.com", password="StrongPass123!")

    response = api_client.post(
        "/api/v1/customer/auth/login/",
        {"email": user.email, "password": "StrongPass123!"},
        format="json",
    )

    assert response.status_code == 200
    assert "refresh" not in response.data["data"]
    assert response.data["data"]["access"]

    cookie = response.cookies[COOKIE_NAME]
    assert cookie.value
    assert cookie["httponly"]
    assert cookie["samesite"] == "Lax"


def test_full_login_refresh_logout_cycle(api_client):
    user = create_user(email="cookie-cycle@example.com", password="StrongPass123!")

    login = api_client.post(
        "/api/v1/customer/auth/login/",
        {"email": user.email, "password": "StrongPass123!"},
        format="json",
    )
    api_client.cookies[COOKIE_NAME] = login.cookies[COOKIE_NAME].value

    me = api_client.get(
        "/api/v1/customer/auth/me/",
        HTTP_AUTHORIZATION=f"Bearer {login.data['data']['access']}",
    )
    assert me.status_code == 200
    assert me.data["data"]["email"] == user.email

    refresh = api_client.post("/api/v1/customer/auth/refresh/", format="json")
    assert refresh.status_code == 200
    assert refresh.data["data"]["access"]
    api_client.cookies[COOKIE_NAME] = refresh.cookies[COOKIE_NAME].value

    logout = api_client.post(
        "/api/v1/customer/auth/logout/",
        HTTP_AUTHORIZATION=f"Bearer {refresh.data['data']['access']}",
    )
    assert logout.status_code == 204
    assert logout.cookies[COOKIE_NAME].value == ""

    replayed = api_client.post("/api/v1/customer/auth/refresh/", format="json")
    assert replayed.status_code == 401


def test_refresh_cookie_lifetime_tracks_the_token_not_the_remember_me_maximum(api_client):
    """A non-remember-me session used to be handed a 30-day cookie wrapping a
    one-day token, leaving the client "logged in" for 29 days of 401s."""
    user = create_user(email="cookie-maxage@example.com", password="StrongPass123!")
    api_client.post(
        "/api/v1/customer/auth/login/",
        {"email": user.email, "password": "StrongPass123!", "remember_me": False},
        format="json",
    )

    refreshed = api_client.post("/api/v1/customer/auth/refresh/", format="json")

    assert refreshed.status_code == 200
    max_age = int(refreshed.cookies[COOKIE_NAME]["max-age"])
    default_lifetime = int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds())
    remember_me_lifetime = int(settings.REMEMBER_ME_REFRESH_TOKEN_LIFETIME.total_seconds())

    assert max_age <= default_lifetime
    assert max_age < remember_me_lifetime


def test_remember_me_session_keeps_its_longer_cookie_after_refresh(api_client):
    user = create_user(email="cookie-remember@example.com", password="StrongPass123!")
    api_client.post(
        "/api/v1/customer/auth/login/",
        {"email": user.email, "password": "StrongPass123!", "remember_me": True},
        format="json",
    )

    refreshed = api_client.post("/api/v1/customer/auth/refresh/", format="json")

    max_age = int(refreshed.cookies[COOKIE_NAME]["max-age"])
    default_lifetime = int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds())

    assert max_age > default_lifetime


def test_logout_works_without_a_live_access_token(api_client):
    """The access token expires in 15 minutes; requiring one meant a slightly
    stale tab could not log out and its refresh cookie stayed valid."""
    user = create_user(email="cookie-stale-logout@example.com", password="StrongPass123!")
    api_client.post(
        "/api/v1/customer/auth/login/",
        {"email": user.email, "password": "StrongPass123!"},
        format="json",
    )
    api_client.credentials()  # drop the Authorization header, keep the cookie

    response = api_client.post("/api/v1/customer/auth/logout/", format="json")

    assert response.status_code == 204
    assert response.cookies[COOKIE_NAME].value == ""
