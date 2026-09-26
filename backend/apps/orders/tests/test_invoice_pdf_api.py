from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest

from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.factories import AddressFactory
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductVariantFactory
from apps.orders.factories import SalesOrderFactory, SalesOrderLineFactory

pytestmark = pytest.mark.django_db


def _url(order_id) -> str:
    return f"/api/v1/admin/orders/{order_id}/invoice/"


def _order_with_lines(customer=None):
    customer = customer or create_user(email=f"buyer-{uuid4().hex[:8]}@example.com")
    order = SalesOrderFactory(customer=customer, shipping_address=AddressFactory(user=customer))
    for _ in range(2):
        SalesOrderLineFactory(
            order=order,
            variant=ProductVariantFactory(),
            quantity=2,
            unit_price=Decimal("1250.00"),
        )
    order.recalculate_totals()
    return order


def test_admin_can_download_invoice_pdf(api_client):
    admin = create_user(email="invoice-pdf-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    order = _order_with_lines()

    response = api_client.get(_url(order.id))

    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"
    assert response["Content-Disposition"] == (
        f'attachment; filename="invoice-{order.order_number}.pdf"'
    )
    body = response.content
    assert body.startswith(b"%PDF-")
    assert len(body) > 1000


def test_invoice_pdf_renders_without_a_shipping_address(api_client):
    admin = create_user(email="invoice-pdf-noaddr@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    order = _order_with_lines()
    order.shipping_address = None
    order.save(update_fields=["shipping_address", "updated_at"])

    response = api_client.get(_url(order.id))

    assert response.status_code == 200
    assert response.content.startswith(b"%PDF-")


def test_staff_with_orders_view_can_download_invoice_pdf(api_client):
    staff = create_user(email="invoice-pdf-view@example.com", role=UserRole.STAFF)
    admin = create_user(email="invoice-pdf-grantor@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.ORDERS_VIEW,
        is_enabled=True,
        granted_by=admin,
    )
    api_client.force_authenticate(user=staff)
    order = _order_with_lines()

    response = api_client.get(_url(order.id))

    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"


def test_staff_without_orders_permission_cannot_download_invoice_pdf(api_client):
    staff = create_user(email="invoice-pdf-denied@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)
    order = _order_with_lines()

    response = api_client.get(_url(order.id))

    assert response.status_code == 403


def test_customer_cannot_download_another_customers_invoice_pdf(api_client, customer_user):
    api_client.force_authenticate(user=customer_user)
    order = _order_with_lines()

    response = api_client.get(_url(order.id))

    assert response.status_code == 403


def test_anonymous_cannot_download_invoice_pdf(api_client):
    order = _order_with_lines()

    response = api_client.get(_url(order.id))

    assert response.status_code == 401


def test_missing_order_invoice_pdf_returns_404(api_client):
    admin = create_user(email="invoice-pdf-404@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.get(_url(uuid4()))

    assert response.status_code == 404
