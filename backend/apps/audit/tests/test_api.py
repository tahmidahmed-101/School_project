from __future__ import annotations

import pytest

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.audit.factories import AuditLogFactory

pytestmark = pytest.mark.django_db


def test_customer_cannot_list_audit_logs(api_client):
    customer = create_user(email="audit-customer@example.com")
    api_client.force_authenticate(user=customer)

    response = api_client.get("/api/v1/admin/audit/")

    assert response.status_code == 403


def test_admin_can_list_search_and_order_audit_logs(api_client):
    admin = create_user(email="audit-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    AuditLogFactory(action="user.updated")
    AuditLogFactory(action="user.deactivated")

    response = api_client.get("/api/v1/admin/audit/")

    assert response.status_code == 200
    assert response.data["data"]["count"] == 2

    response = api_client.get("/api/v1/admin/audit/", {"search": "deactivated"})

    assert response.data["data"]["count"] == 1
    assert response.data["data"]["results"][0]["action"] == "user.deactivated"


def test_admin_actions_are_recorded_in_audit_log(api_client):
    admin = create_user(email="audit-recorder-admin@example.com", role=UserRole.ADMIN)
    target = create_user(email="audit-recorder-target@example.com")
    api_client.force_authenticate(user=admin)

    response = api_client.post(f"/api/v1/admin/users/{target.id}/deactivate/")

    assert response.status_code == 200

    response = api_client.get("/api/v1/admin/audit/", {"search": "deactivated"})

    assert response.data["data"]["count"] == 1
    assert response.data["data"]["results"][0]["actor"] == admin.email


def test_admin_can_retrieve_audit_log_detail(api_client):
    admin = create_user(email="audit-detail-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    log = AuditLogFactory(action="user.updated")

    response = api_client.get(f"/api/v1/admin/audit/{log.id}/")

    assert response.status_code == 200
    assert response.data["data"]["id"] == str(log.id)
    assert response.data["data"]["action"] == "user.updated"


def test_audit_log_detail_404_for_unknown_id(api_client):
    admin = create_user(email="audit-detail-404@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.get("/api/v1/admin/audit/11111111-1111-1111-1111-111111111111/")

    assert response.status_code == 404
    assert response.data["error"]["code"] == "audit_log_not_found"


def test_customer_cannot_retrieve_audit_log_detail(api_client):
    customer = create_user(email="audit-detail-customer@example.com")
    api_client.force_authenticate(user=customer)
    log = AuditLogFactory()

    response = api_client.get(f"/api/v1/admin/audit/{log.id}/")

    assert response.status_code == 403


def test_admin_can_export_audit_logs_as_csv(api_client):
    admin = create_user(email="audit-export-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    AuditLogFactory(action="user.exported")
    AuditLogFactory(action="user.ignored")

    response = api_client.get("/api/v1/admin/audit/export/")

    assert response.status_code == 200
    assert response["Content-Type"] == "text/csv"
    assert b"user.exported" in response.content
    assert b"user.ignored" in response.content


def test_audit_export_honours_the_list_search_filter(api_client):
    admin = create_user(email="audit-export-search@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    AuditLogFactory(action="user.exported")
    AuditLogFactory(action="user.ignored")

    response = api_client.get("/api/v1/admin/audit/export/", {"search": "exported"})

    assert response.status_code == 200
    assert b"user.exported" in response.content
    assert b"user.ignored" not in response.content


def test_customer_cannot_export_audit_logs(api_client):
    customer = create_user(email="audit-export-customer@example.com")
    api_client.force_authenticate(user=customer)

    response = api_client.get("/api/v1/admin/audit/export/")

    assert response.status_code == 403
