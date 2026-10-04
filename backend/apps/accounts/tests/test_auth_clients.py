"""The storefront and the dashboard share one login endpoint but hold separate
sessions: each names itself in `X-Auth-Client` and gets its own refresh cookie."""

from __future__ import annotations

import pytest
from django.conf import settings

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user

pytestmark = pytest.mark.django_db

LOGIN = "/api/v1/customer/auth/login/"
REFRESH = "/api/v1/customer/auth/refresh/"
LOGOUT = "/api/v1/customer/auth/logout/"
ME = "/api/v1/customer/auth/me/"
ADMIN_API = "/api/v1/admin/catalog/products/"

STOREFRONT_COOKIE = settings.REFRESH_COOKIE_NAMES[settings.AUTH_CLIENT_STOREFRONT]
DASHBOARD_COOKIE = settings.REFRESH_COOKIE_NAMES[settings.AUTH_CLIENT_DASHBOARD]
PASSWORD = "StrongPass123!"

DASHBOARD = {"HTTP_X_AUTH_CLIENT": "dashboard"}
STOREFRONT = {"HTTP_X_AUTH_CLIENT": "storefront"}


def _login(api_client, user, **headers):
    return api_client.post(
        LOGIN, {"email": user.email, "password": PASSWORD}, format="json", **headers
    )


def _whoami(api_client, access: str) -> str:
    response = api_client.get(ME, HTTP_AUTHORIZATION=f"Bearer {access}")
    assert response.status_code == 200
    return response.data["data"]["email"]


def test_the_cookies_have_different_names():
    assert STOREFRONT_COOKIE != DASHBOARD_COOKIE


def test_each_client_gets_its_own_refresh_cookie(api_client):
    customer = create_user(email="shopper@example.com", password=PASSWORD)
    admin = create_user(email="boss@example.com", password=PASSWORD, role=UserRole.ADMIN)

    storefront = _login(api_client, customer, **STOREFRONT)
    dashboard = _login(api_client, admin, **DASHBOARD)

    assert set(storefront.cookies) == {STOREFRONT_COOKIE}
    assert set(dashboard.cookies) == {DASHBOARD_COOKIE}
    for response, name in ((storefront, STOREFRONT_COOKIE), (dashboard, DASHBOARD_COOKIE)):
        cookie = response.cookies[name]
        assert cookie["httponly"]
        assert cookie["samesite"] == "Lax"
        assert cookie["path"] == "/api/v1/customer/auth/"


def test_a_request_without_the_header_is_the_storefront(api_client):
    customer = create_user(email="legacy@example.com", password=PASSWORD)

    response = _login(api_client, customer)

    assert set(response.cookies) == {STOREFRONT_COOKIE}


def test_an_unknown_client_is_the_storefront(api_client):
    customer = create_user(email="odd@example.com", password=PASSWORD)

    response = _login(api_client, customer, HTTP_X_AUTH_CLIENT="something-else")

    assert set(response.cookies) == {STOREFRONT_COOKIE}


def test_logging_into_one_app_leaves_the_other_session_alone(api_client):
    """One browser (one cookie jar) signed in to both apps as different people."""
    customer = create_user(email="shopper@example.com", password=PASSWORD)
    admin = create_user(email="boss@example.com", password=PASSWORD, role=UserRole.ADMIN)

    assert _login(api_client, admin, **DASHBOARD).status_code == 200
    assert _login(api_client, customer, **STOREFRONT).status_code == 200

    # Each app refreshes into its own account, in either order, repeatedly.
    for _ in range(2):
        dashboard = api_client.post(REFRESH, **DASHBOARD)
        storefront = api_client.post(REFRESH, **STOREFRONT)
        assert dashboard.status_code == 200
        assert storefront.status_code == 200
        assert _whoami(api_client, dashboard.data["data"]["access"]) == admin.email
        assert _whoami(api_client, storefront.data["data"]["access"]) == customer.email
        # A refresh rotates only the caller's cookie.
        assert set(dashboard.cookies) == {DASHBOARD_COOKIE}
        assert set(storefront.cookies) == {STOREFRONT_COOKIE}


def test_logging_out_of_the_storefront_keeps_the_dashboard_session(api_client):
    customer = create_user(email="shopper@example.com", password=PASSWORD)
    admin = create_user(email="boss@example.com", password=PASSWORD, role=UserRole.ADMIN)
    _login(api_client, admin, **DASHBOARD)
    _login(api_client, customer, **STOREFRONT)

    logout = api_client.post(LOGOUT, **STOREFRONT)

    assert logout.status_code == 204
    assert set(logout.cookies) == {STOREFRONT_COOKIE}  # only this cookie is cleared
    assert api_client.post(REFRESH, **STOREFRONT).status_code == 401
    dashboard = api_client.post(REFRESH, **DASHBOARD)
    assert dashboard.status_code == 200
    assert _whoami(api_client, dashboard.data["data"]["access"]) == admin.email


def test_logging_out_of_the_dashboard_keeps_the_storefront_session(api_client):
    customer = create_user(email="shopper@example.com", password=PASSWORD)
    admin = create_user(email="boss@example.com", password=PASSWORD, role=UserRole.ADMIN)
    _login(api_client, admin, **DASHBOARD)
    _login(api_client, customer, **STOREFRONT)

    logout = api_client.post(LOGOUT, **DASHBOARD)

    assert logout.status_code == 204
    assert set(logout.cookies) == {DASHBOARD_COOKIE}
    assert api_client.post(REFRESH, **DASHBOARD).status_code == 401
    storefront = api_client.post(REFRESH, **STOREFRONT)
    assert storefront.status_code == 200
    assert _whoami(api_client, storefront.data["data"]["access"]) == customer.email


def test_a_storefront_session_does_not_open_the_dashboard(api_client):
    """The old bug: a storefront login used to show up as a dashboard session."""
    customer = create_user(email="shopper@example.com", password=PASSWORD)
    _login(api_client, customer, **STOREFRONT)

    assert api_client.post(REFRESH, **DASHBOARD).status_code == 401


def test_a_customer_cannot_sign_in_to_the_dashboard(api_client):
    customer = create_user(email="shopper@example.com", password=PASSWORD)

    response = _login(api_client, customer, **DASHBOARD)

    assert response.status_code == 403
    assert response.data["error"]["code"] == "auth_not_staff"
    assert not response.cookies
    assert "data" not in response.data


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.STAFF])
def test_staff_can_sign_in_to_the_dashboard(api_client, role):
    user = create_user(email="team@example.com", password=PASSWORD, role=role)

    response = _login(api_client, user, **DASHBOARD)

    assert response.status_code == 200
    assert DASHBOARD_COOKIE in response.cookies


def test_a_customer_token_is_refused_by_admin_apis_whatever_the_header(api_client):
    """The header picks a cookie. It grants nothing: Django decides from the user."""
    customer = create_user(email="shopper@example.com", password=PASSWORD)
    access = _login(api_client, customer, **STOREFRONT).data["data"]["access"]

    response = api_client.get(ADMIN_API, HTTP_AUTHORIZATION=f"Bearer {access}", **DASHBOARD)

    assert response.status_code == 403


def test_an_admin_token_reaches_admin_apis(api_client):
    admin = create_user(email="boss@example.com", password=PASSWORD, role=UserRole.ADMIN)
    access = _login(api_client, admin, **DASHBOARD).data["data"]["access"]

    response = api_client.get(ADMIN_API, HTTP_AUTHORIZATION=f"Bearer {access}", **DASHBOARD)

    assert response.status_code == 200


def test_the_header_is_allowed_cross_origin():
    assert "x-auth-client" in settings.CORS_ALLOW_HEADERS
