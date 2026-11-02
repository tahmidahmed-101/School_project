"""Authorization sweep over the admin API surface.

Rather than trusting that each of ~95 admin endpoints remembered to declare a
permission, this walks the URL conf and asserts the answer for every one of
them. A new endpoint added without a permission class fails here instead of
shipping open, and nothing has to be added to this file to cover it.
"""

from __future__ import annotations

import re
import uuid

import pytest
from django.urls import get_resolver

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user

pytestmark = pytest.mark.django_db

# A real UUID substituted for every <uuid:...> capture. The object won't
# exist, but authorization is checked before the lookup, so an authorized
# caller gets 404 and an unauthorized one gets 401/403 — which is the
# distinction under test.
PLACEHOLDER = str(uuid.uuid4())

UNAUTHORIZED = {401, 403}

# Reads every dashboard user needs; each has its own test of who may call it.
OPEN_TO_ANY_STAFF = {"/api/v1/admin/settings/modules/"}


def _admin_paths() -> list[str]:
    paths: list[str] = []

    def walk(resolver, prefix=""):
        for entry in resolver.url_patterns:
            if hasattr(entry, "url_patterns"):
                walk(entry, prefix + str(entry.pattern))
            else:
                route = prefix + str(entry.pattern)
                if route.startswith("api/v1/admin/"):
                    paths.append("/" + re.sub(r"<[^>]+>", PLACEHOLDER, route))

    walk(get_resolver())
    return sorted(set(paths))


ADMIN_PATHS = _admin_paths()


def test_the_sweep_actually_found_the_admin_surface():
    """Guards against the URL walk silently matching nothing, which would make
    every assertion below vacuously true."""
    assert len(ADMIN_PATHS) > 50


@pytest.mark.parametrize("path", ADMIN_PATHS)
def test_admin_endpoints_reject_anonymous_callers(api_client, path):
    response = api_client.get(path)
    assert response.status_code in UNAUTHORIZED, (
        f"{path} answered {response.status_code} to an anonymous GET"
    )


@pytest.mark.parametrize("path", ADMIN_PATHS)
def test_admin_endpoints_reject_customers(api_client, path):
    customer = create_user(email="sweep-customer@example.com", role=UserRole.CUSTOMER)
    api_client.force_authenticate(user=customer)

    response = api_client.get(path)
    assert response.status_code in UNAUTHORIZED, (
        f"{path} answered {response.status_code} to a customer GET"
    )


OPEN_TO_ANY_STAFF = {"/api/v1/admin/settings/modules/"}


@pytest.mark.parametrize("path", [p for p in ADMIN_PATHS if p not in OPEN_TO_ANY_STAFF])
def test_admin_endpoints_reject_staff_holding_no_permissions(api_client, path):
    """Staff are only what their granted permission codes say they are — an
    account with none must be able to read nothing."""
    if path in OPEN_TO_ANY_STAFF:
        pytest.skip("readable by any staff member by design")
    staff = create_user(email="sweep-staff@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)

    response = api_client.get(path)
    assert response.status_code in UNAUTHORIZED, (
        f"{path} answered {response.status_code} to a permissionless staff GET"
    )


def test_user_management_is_not_delegable_to_staff(api_client):
    """Creating users and changing roles is the path to privilege escalation,
    so it stays admin-only and is never unlocked by a staff permission code."""
    from apps.accounts.constants import StaffPermissionCode
    from apps.accounts.services.staff_permissions import set_staff_permission

    staff = create_user(email="escalation-attempt@example.com", role=UserRole.STAFF)
    # Grant every staff permission that exists.
    for code in StaffPermissionCode.values:
        set_staff_permission(staff_user=staff, permission_code=code, is_enabled=True)
    api_client.force_authenticate(user=staff)

    victim = create_user(email="escalation-victim@example.com", role=UserRole.CUSTOMER)

    assert api_client.get("/api/v1/admin/users/").status_code in UNAUTHORIZED
    assert (
        api_client.post(
            f"/api/v1/admin/users/{victim.id}/set-role/", {"role": "admin"}, format="json"
        ).status_code
        in UNAUTHORIZED
    )

    victim.refresh_from_db()
    assert victim.role == UserRole.CUSTOMER


def test_customers_cannot_reach_another_customers_order(api_client):
    from apps.catalog.factories import ProductVariantFactory
    from apps.orders.services.carts import add_line, get_or_create_cart

    owner = create_user(email="order-owner@example.com", role=UserRole.CUSTOMER)
    intruder = create_user(email="order-intruder@example.com", role=UserRole.CUSTOMER)
    order = get_or_create_cart(owner)
    add_line(order=order, variant=ProductVariantFactory(), quantity=1)

    api_client.force_authenticate(user=intruder)
    response = api_client.get(f"/api/v1/customer/orders/{order.id}/")

    # 404 rather than 403: confirming the order exists would already leak.
    assert response.status_code == 404
