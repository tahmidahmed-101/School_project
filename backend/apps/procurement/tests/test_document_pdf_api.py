from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest

from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductVariantFactory
from apps.procurement.factories import (
    PurchaseOrderFactory,
    PurchaseOrderLineFactory,
    VendorBillFactory,
    VendorPaymentFactory,
)

pytestmark = pytest.mark.django_db


def _po_url(po_id) -> str:
    return f"/api/v1/admin/procurement/purchase-orders/{po_id}/pdf/"


def _bill_url(bill_id) -> str:
    return f"/api/v1/admin/procurement/vendor-bills/{bill_id}/pdf/"


def _purchase_order_with_lines():
    purchase_order = PurchaseOrderFactory()
    for _ in range(2):
        PurchaseOrderLineFactory(
            purchase_order=purchase_order,
            variant=ProductVariantFactory(),
            quantity_ordered=10,
            quantity_received=10,
            unit_cost=Decimal("125.5000"),
        )
    return purchase_order


def _grant(staff, code):
    admin = create_user(email=f"grantor-{uuid4().hex[:8]}@example.com", role=UserRole.ADMIN)
    set_staff_permission(staff_user=staff, permission_code=code, is_enabled=True, granted_by=admin)


def test_admin_can_download_purchase_order_pdf(api_client):
    admin = create_user(email="po-pdf-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    purchase_order = _purchase_order_with_lines()

    response = api_client.get(_po_url(purchase_order.id))

    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"
    assert response["Content-Disposition"] == (
        f'attachment; filename="purchase-order-{purchase_order.po_number}.pdf"'
    )
    body = response.content
    assert body.startswith(b"%PDF-")
    assert len(body) > 1000


def test_staff_with_purchasing_view_can_download_purchase_order_pdf(api_client):
    staff = create_user(email="po-pdf-view@example.com", role=UserRole.STAFF)
    _grant(staff, StaffPermissionCode.PURCHASING_VIEW)
    api_client.force_authenticate(user=staff)
    purchase_order = _purchase_order_with_lines()

    response = api_client.get(_po_url(purchase_order.id))

    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"


def test_staff_without_purchasing_permission_cannot_download_purchase_order_pdf(api_client):
    staff = create_user(email="po-pdf-denied@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)
    purchase_order = _purchase_order_with_lines()

    response = api_client.get(_po_url(purchase_order.id))

    assert response.status_code == 403


def test_anonymous_cannot_download_purchase_order_pdf(api_client):
    purchase_order = _purchase_order_with_lines()

    response = api_client.get(_po_url(purchase_order.id))

    assert response.status_code == 401


def test_missing_purchase_order_pdf_returns_404(api_client):
    admin = create_user(email="po-pdf-404@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.get(_po_url(uuid4()))

    assert response.status_code == 404


def test_admin_can_download_vendor_bill_pdf(api_client):
    admin = create_user(email="bill-pdf-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    purchase_order = _purchase_order_with_lines()
    bill = VendorBillFactory(
        purchase_order=purchase_order,
        supplier=purchase_order.supplier,
        amount=Decimal("2510.00"),
    )
    VendorPaymentFactory(vendor_bill=bill, amount=Decimal("1000.00"))

    response = api_client.get(_bill_url(bill.id))

    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"
    assert response["Content-Disposition"] == (
        f'attachment; filename="vendor-bill-{bill.bill_number}.pdf"'
    )
    body = response.content
    assert body.startswith(b"%PDF-")
    assert len(body) > 1000


def test_staff_with_accounting_view_can_download_vendor_bill_pdf(api_client):
    staff = create_user(email="bill-pdf-view@example.com", role=UserRole.STAFF)
    _grant(staff, StaffPermissionCode.ACCOUNTING_VIEW)
    api_client.force_authenticate(user=staff)
    purchase_order = _purchase_order_with_lines()
    bill = VendorBillFactory(purchase_order=purchase_order, supplier=purchase_order.supplier)

    response = api_client.get(_bill_url(bill.id))

    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"


def test_staff_without_accounting_permission_cannot_download_vendor_bill_pdf(api_client):
    staff = create_user(email="bill-pdf-denied@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)
    purchase_order = _purchase_order_with_lines()
    bill = VendorBillFactory(purchase_order=purchase_order, supplier=purchase_order.supplier)

    response = api_client.get(_bill_url(bill.id))

    assert response.status_code == 403


def test_anonymous_cannot_download_vendor_bill_pdf(api_client):
    purchase_order = _purchase_order_with_lines()
    bill = VendorBillFactory(purchase_order=purchase_order, supplier=purchase_order.supplier)

    response = api_client.get(_bill_url(bill.id))

    assert response.status_code == 401


def test_missing_vendor_bill_pdf_returns_404(api_client):
    admin = create_user(email="bill-pdf-404@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.get(_bill_url(uuid4()))

    assert response.status_code == 404
