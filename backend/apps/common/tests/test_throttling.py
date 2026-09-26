"""Rate-limit scopes.

A single `anon` rate cannot serve both purposes: tight enough to slow
credential stuffing, it throttles ordinary storefront browsing; loose enough
to browse, it leaves login wide open. These tests pin each scope to the
endpoints it is supposed to cover.
"""

from __future__ import annotations

import pytest
from django.core.cache import cache

from apps.accounts.tests.helpers import create_user

pytestmark = pytest.mark.django_db

LOGIN_URL = "/api/v1/customer/auth/login/"
PUBLIC_PRODUCTS_URL = "/api/v1/public/catalog/products/"


@pytest.fixture(autouse=True)
def _clear_throttle_counters():
    cache.clear()
    yield
    cache.clear()


def _rates(**overrides):
    base = {
        "anon": None,
        "user": None,
        "auth": None,
        "login_account": None,
        "public_read": None,
        "otp": None,
    }
    base.update(overrides)
    return {"DEFAULT_THROTTLE_RATES": base}


def test_login_is_rate_limited_per_ip(api_client, settings):
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, **_rates(auth="3/min")}
    create_user(email="throttle-victim@example.com", password="StrongPass123")

    statuses = [
        api_client.post(
            LOGIN_URL,
            {"email": "throttle-victim@example.com", "password": "wrong-password"},
            format="json",
        ).status_code
        for _ in range(5)
    ]

    assert 429 in statuses, f"expected a 429 among {statuses}"


def test_login_is_rate_limited_per_account(api_client, settings):
    """Guessing one account from many IPs must still be capped — an IP-only
    limit tight enough to stop that would lock out shared-NAT users."""
    settings.REST_FRAMEWORK = {
        **settings.REST_FRAMEWORK,
        **_rates(login_account="3/min"),
    }
    create_user(email="targeted@example.com", password="StrongPass123")

    # A different source address each time; only the account is constant.
    statuses = [
        api_client.post(
            LOGIN_URL,
            {"email": "targeted@example.com", "password": "wrong-password"},
            format="json",
            REMOTE_ADDR=f"10.0.0.{index + 1}",
        ).status_code
        for index in range(5)
    ]

    assert 429 in statuses, f"expected a 429 among {statuses}"


def test_public_catalog_is_not_held_to_the_tight_auth_limit(api_client, settings):
    """The storefront must survive more than a handful of anonymous reads."""
    settings.REST_FRAMEWORK = {
        **settings.REST_FRAMEWORK,
        **_rates(auth="3/min", public_read="1000/hour"),
    }

    statuses = [api_client.get(PUBLIC_PRODUCTS_URL).status_code for _ in range(25)]

    assert all(code == 200 for code in statuses), f"unexpected statuses: {set(statuses)}"


def test_public_catalog_still_has_a_ceiling(api_client, settings):
    settings.REST_FRAMEWORK = {
        **settings.REST_FRAMEWORK,
        **_rates(public_read="5/min"),
    }

    statuses = [api_client.get(PUBLIC_PRODUCTS_URL).status_code for _ in range(8)]

    assert 429 in statuses, f"expected a 429 among {statuses}"


def test_otp_issuance_is_capped_per_user(api_client, settings):
    """Each of these sends an SMS to a number the caller supplies, so the
    generic `user` rate would fund thousands of Twilio messages an hour."""
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, **_rates(otp="2/hour")}
    user = create_user(email="otp-throttle@example.com", password="StrongPass123")
    api_client.force_authenticate(user=user)

    statuses = [
        api_client.post(
            "/api/v1/customer/auth/request-phone-change/",
            {"new_phone": "+15550001111"},
            format="json",
        ).status_code
        for _ in range(3)
    ]

    assert statuses[-1] == 429
