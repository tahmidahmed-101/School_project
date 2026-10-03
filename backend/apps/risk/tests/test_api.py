from __future__ import annotations

from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.factories import AddressFactory, CustomerUserFactory
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user
from apps.orders.factories import SalesOrderFactory
from apps.risk.factories import FraudCaseFactory, PhoneBlockFactory

pytestmark = pytest.mark.django_db


def _staff_with(api_client, *codes):
    staff = create_user(email=f"risk-staff-{'-'.join(codes)}@example.com", role=UserRole.STAFF)
    admin = create_user(email=f"risk-admin-{'-'.join(codes)}@example.com", role=UserRole.ADMIN)
    for code in codes:
        set_staff_permission(
            staff_user=staff, permission_code=code, is_enabled=True, granted_by=admin
        )
    api_client.force_authenticate(user=staff)
    return staff


def test_assess_requires_manage_permission(api_client):
    order = SalesOrderFactory(grand_total=Decimal("1000.00"), contact_phone="01711223344")
    _staff_with(api_client, StaffPermissionCode.RISK_VIEW)

    response = api_client.post(f"/api/v1/admin/risk/orders/{order.id}/assess/")

    assert response.status_code == 403


def test_assess_scores_the_order(api_client):
    order = SalesOrderFactory(grand_total=Decimal("1000.00"), contact_phone="01711223344")
    _staff_with(api_client, StaffPermissionCode.RISK_MANAGE)

    response = api_client.post(f"/api/v1/admin/risk/orders/{order.id}/assess/")

    assert response.status_code == 201
    assert response.data["data"]["risk_level"] == "low"
    assert "guidance" in response.data["data"]


def test_assess_unknown_order_is_404(api_client):
    _staff_with(api_client, StaffPermissionCode.RISK_MANAGE)

    response = api_client.post(
        "/api/v1/admin/risk/orders/00000000-0000-0000-0000-000000000000/assess/"
    )

    assert response.status_code == 404


def test_case_list_and_resolve(api_client):
    case = FraudCaseFactory()
    _staff_with(api_client, StaffPermissionCode.RISK_MANAGE)

    listed = api_client.get("/api/v1/admin/risk/cases/")
    assert listed.status_code == 200
    assert listed.data["data"]["count"] == 1

    resolved = api_client.patch(
        f"/api/v1/admin/risk/cases/{case.id}/resolve/",
        {"resolution": "false_positive", "resolution_notes": "Confirmed by phone"},
    )
    assert resolved.status_code == 200
    assert resolved.data["data"]["status"] == "resolved"


def _case(*, email="", contact_phone="", address_phone="", customer_phone="", customer_email=None):
    customer = CustomerUserFactory(
        phone=customer_phone,
        **({"email": customer_email} if customer_email else {}),
    )
    order = SalesOrderFactory(
        customer=customer,
        contact_email=email,
        contact_phone=contact_phone,
        shipping_address=AddressFactory(user=customer, phone=address_phone or "01500000000"),
    )
    return FraudCaseFactory(order=order, customer=customer)


def _search_ids(api_client, term):
    response = api_client.get("/api/v1/admin/risk/cases/", {"search": term})
    assert response.status_code == 200, response.data
    return {row["id"] for row in response.data["data"]["results"]}


def test_case_search_by_email_is_case_insensitive(api_client):
    by_order_email = _case(email="Rahim.Uddin@Example.com")
    by_account_email = _case(customer_email="sadia.k@example.com")
    _case(email="someone.else@example.com")
    _staff_with(api_client, StaffPermissionCode.RISK_VIEW)

    assert _search_ids(api_client, "rahim.uddin@EXAMPLE.COM") == {str(by_order_email.id)}
    assert _search_ids(api_client, "SADIA.K@example.com") == {str(by_account_email.id)}


def test_case_search_by_phone_matches_every_stored_format(api_client):
    contact = _case(contact_phone="+8801711223344")
    address = _case(address_phone="01822334455")
    account = _case(customer_phone="8801933445566")
    _case(contact_phone="01699887766")
    _staff_with(api_client, StaffPermissionCode.RISK_VIEW)

    assert _search_ids(api_client, "01711223344") == {str(contact.id)}
    assert _search_ids(api_client, "+8801822334455") == {str(address.id)}
    assert _search_ids(api_client, "+8801933445566") == {str(account.id)}


def test_case_search_by_case_and_order_number(api_client):
    case = _case()
    _case()
    _staff_with(api_client, StaffPermissionCode.RISK_VIEW)

    assert _search_ids(api_client, case.case_number.lower()) == {str(case.id)}
    assert _search_ids(api_client, case.order.order_number) == {str(case.id)}


def test_case_search_query_count_does_not_grow_with_matches(api_client):
    _staff_with(api_client, StaffPermissionCode.RISK_VIEW)
    _case(email="match-1@example.com")
    with CaptureQueriesContext(connection) as one:
        assert len(_search_ids(api_client, "match-")) == 1
    for n in range(2, 7):
        _case(email=f"match-{n}@example.com")
    with CaptureQueriesContext(connection) as many:
        assert len(_search_ids(api_client, "match-")) == 6

    assert len(many) == len(one)


@pytest.mark.parametrize("who", ["anonymous", "customer", "staff_without_risk"])
def test_case_search_rejects_unauthorised_users(api_client, who):
    _case(email="private@example.com")
    if who == "customer":
        api_client.force_authenticate(user=CustomerUserFactory())
    elif who == "staff_without_risk":
        _staff_with(api_client, StaffPermissionCode.ORDERS_VIEW)

    response = api_client.get("/api/v1/admin/risk/cases/", {"search": "private@example.com"})

    assert response.status_code == (401 if who == "anonymous" else 403)
    assert "results" not in str(response.data)


def test_ip_blocklist_crud(api_client):
    _staff_with(api_client, StaffPermissionCode.RISK_MANAGE)

    created = api_client.post(
        "/api/v1/admin/risk/ip-blocklist/", {"ip_address": "203.0.113.9", "reason": "abuse"}
    )
    assert created.status_code == 201

    listed = api_client.get("/api/v1/admin/risk/ip-blocklist/")
    assert listed.status_code == 200
    assert len(listed.data["data"]) == 1

    deleted = api_client.delete("/api/v1/admin/risk/ip-blocklist/?ip_address=203.0.113.9")
    assert deleted.status_code == 200


def test_phone_blocklist_view_only_cannot_write(api_client):
    _staff_with(api_client, StaffPermissionCode.RISK_VIEW)

    response = api_client.post(
        "/api/v1/admin/risk/phone-blocklist/",
        {"phone_number": "01711223344", "reason": "abuse"},
    )

    assert response.status_code == 403


def test_phone_blocklist_lift(api_client):
    block = PhoneBlockFactory()
    _staff_with(api_client, StaffPermissionCode.RISK_MANAGE)

    response = api_client.post(
        f"/api/v1/admin/risk/phone-blocklist/{block.phone_number}/lift/", {"reason": "resolved"}
    )

    assert response.status_code == 200
    assert response.data["data"]["lifted_at"] is not None
