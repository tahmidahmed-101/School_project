from __future__ import annotations

from decimal import Decimal

import pytest

from apps.accounts.constants import StaffPermissionCode, UserRole
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
