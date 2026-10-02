from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductImageFactory, ProductVariantFactory
from apps.procurement.factories import (
    GoodsReceiptNoteFactory,
    PurchaseOrderFactory,
    PurchaseOrderLineFactory,
    SupplierFactory,
    VendorBillFactory,
    VendorPaymentFactory,
)
from apps.procurement.models import PurchaseOrder, VendorBill

pytestmark = pytest.mark.django_db


def test_staff_without_permission_cannot_list_suppliers(api_client):
    staff = create_user(email="proc-staff@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)

    response = api_client.get("/api/v1/admin/procurement/suppliers/")

    assert response.status_code == 403


def test_staff_with_purchasing_permission_can_create_supplier(api_client):
    staff = create_user(email="proc-staff-2@example.com", role=UserRole.STAFF)
    admin = create_user(email="proc-grantor@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.PURCHASING_MANAGE,
        is_enabled=True,
        granted_by=admin,
    )
    api_client.force_authenticate(user=staff)

    response = api_client.post("/api/v1/admin/procurement/suppliers/", {"name": "Acme Supplies"})

    assert response.status_code == 201
    assert response.data["data"]["name"] == "Acme Supplies"


def test_admin_can_list_suppliers(api_client):
    admin = create_user(email="proc-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    SupplierFactory()

    response = api_client.get("/api/v1/admin/procurement/suppliers/")

    assert response.status_code == 200
    assert response.data["data"]["count"] == 1


def _staff(email: str, *codes: str):
    staff = create_user(email=email, role=UserRole.STAFF)
    admin = create_user(email=f"grantor-{email}", role=UserRole.ADMIN)
    for code in codes:
        set_staff_permission(
            staff_user=staff, permission_code=code, is_enabled=True, granted_by=admin
        )
    return staff


def _admin(api_client, email: str):
    admin = create_user(email=email, role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    return admin


def _draft_po(**kwargs):
    po = PurchaseOrderFactory(**kwargs)
    PurchaseOrderLineFactory(purchase_order=po)
    return po


def test_purchasing_view_permission_allows_read_but_not_write(api_client):
    api_client.force_authenticate(
        user=_staff("proc-view@example.com", StaffPermissionCode.PURCHASING_VIEW)
    )

    assert api_client.get("/api/v1/admin/procurement/suppliers/").status_code == 200
    assert (
        api_client.post("/api/v1/admin/procurement/suppliers/", {"name": "Nope"}).status_code == 403
    )


def test_update_purchase_order_header(api_client):
    _admin(api_client, "po-patch@example.com")
    po = _draft_po()

    response = api_client.patch(
        f"/api/v1/admin/procurement/purchase-orders/{po.id}/",
        {"notes": "rush order", "order_date": "2026-01-05"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["data"]["notes"] == "rush order"
    po.refresh_from_db()
    assert po.order_date == date(2026, 1, 5)


def test_update_purchase_order_returns_404_for_unknown_id(api_client):
    _admin(api_client, "po-patch-404@example.com")

    response = api_client.patch(
        f"/api/v1/admin/procurement/purchase-orders/{uuid4()}/", {"notes": "x"}, format="json"
    )

    assert response.status_code == 404
    assert response.data["error"]["code"] == "po_not_found"


def test_update_submitted_purchase_order_is_rejected(api_client):
    _admin(api_client, "po-patch-submitted@example.com")
    po = _draft_po(status=PurchaseOrder.Status.SUBMITTED)

    response = api_client.patch(
        f"/api/v1/admin/procurement/purchase-orders/{po.id}/", {"notes": "x"}, format="json"
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "not_draft"


def test_add_and_update_purchase_order_line(api_client):
    _admin(api_client, "po-line@example.com")
    po = _draft_po()
    variant = ProductVariantFactory()

    created = api_client.post(
        f"/api/v1/admin/procurement/purchase-orders/{po.id}/lines/",
        {"variant_id": str(variant.id), "quantity_ordered": 3, "unit_cost": "7.5000"},
        format="json",
    )

    assert created.status_code == 201
    line_id = created.data["data"]["id"]

    updated = api_client.patch(
        f"/api/v1/admin/procurement/purchase-orders/{po.id}/lines/{line_id}/",
        {"quantity_ordered": 9},
        format="json",
    )

    assert updated.status_code == 200
    assert updated.data["data"]["quantity_ordered"] == 9


def test_add_purchase_order_line_rejected_when_not_draft(api_client):
    _admin(api_client, "po-line-submitted@example.com")
    po = _draft_po(status=PurchaseOrder.Status.SUBMITTED)
    variant = ProductVariantFactory()

    response = api_client.post(
        f"/api/v1/admin/procurement/purchase-orders/{po.id}/lines/",
        {"variant_id": str(variant.id), "quantity_ordered": 1, "unit_cost": "1.0000"},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "not_draft"


def test_remove_purchase_order_line(api_client):
    _admin(api_client, "po-line-del@example.com")
    po = _draft_po()
    extra = PurchaseOrderLineFactory(purchase_order=po)

    response = api_client.delete(
        f"/api/v1/admin/procurement/purchase-orders/{po.id}/lines/{extra.id}/"
    )

    assert response.status_code == 204
    assert po.lines.count() == 1


def test_remove_last_purchase_order_line_is_rejected(api_client):
    _admin(api_client, "po-line-last@example.com")
    po = _draft_po()
    line = po.lines.get()

    response = api_client.delete(
        f"/api/v1/admin/procurement/purchase-orders/{po.id}/lines/{line.id}/"
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "last_line"


def test_purchase_order_line_returns_404_for_unknown_line(api_client):
    _admin(api_client, "po-line-404@example.com")
    po = _draft_po()

    response = api_client.delete(
        f"/api/v1/admin/procurement/purchase-orders/{po.id}/lines/{uuid4()}/"
    )

    assert response.status_code == 404
    assert response.data["error"]["code"] == "po_line_not_found"


def test_purchase_order_line_write_requires_manage_permission(api_client):
    api_client.force_authenticate(
        user=_staff("po-line-perm@example.com", StaffPermissionCode.PURCHASING_VIEW)
    )
    po = _draft_po()

    response = api_client.post(
        f"/api/v1/admin/procurement/purchase-orders/{po.id}/lines/", {}, format="json"
    )

    assert response.status_code == 403


def _matched_bill(**kwargs):
    po = PurchaseOrderFactory()
    PurchaseOrderLineFactory(
        purchase_order=po, quantity_ordered=10, quantity_received=10, unit_cost=Decimal("5.00")
    )
    return VendorBillFactory(purchase_order=po, amount=Decimal("50.00"), **kwargs)


def test_update_vendor_bill_due_date(api_client):
    _admin(api_client, "bill-patch@example.com")
    bill = _matched_bill()

    response = api_client.patch(
        f"/api/v1/admin/procurement/vendor-bills/{bill.id}/",
        {"due_date": "2026-03-01"},
        format="json",
    )

    assert response.status_code == 200
    bill.refresh_from_db()
    assert bill.due_date == date(2026, 3, 1)


def test_update_vendor_bill_amount_reruns_three_way_match(api_client):
    _admin(api_client, "bill-patch-match@example.com")
    bill = _matched_bill()

    response = api_client.patch(
        f"/api/v1/admin/procurement/vendor-bills/{bill.id}/", {"amount": "999.00"}, format="json"
    )

    assert response.status_code == 409
    assert response.data["error"]["code"] == "bill_mismatch"


def test_update_vendor_bill_with_payments_is_rejected(api_client):
    _admin(api_client, "bill-patch-paid@example.com")
    bill = _matched_bill()
    VendorPaymentFactory(vendor_bill=bill, amount=Decimal("10.00"))

    response = api_client.patch(
        f"/api/v1/admin/procurement/vendor-bills/{bill.id}/",
        {"due_date": "2026-03-01"},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "bill_has_payments"


def test_void_vendor_bill(api_client):
    _admin(api_client, "bill-void@example.com")
    bill = _matched_bill()

    response = api_client.post(f"/api/v1/admin/procurement/vendor-bills/{bill.id}/void/")

    assert response.status_code == 200
    bill.refresh_from_db()
    assert bill.status == VendorBill.Status.VOID


def test_void_vendor_bill_with_payments_is_rejected(api_client):
    _admin(api_client, "bill-void-paid@example.com")
    bill = _matched_bill()
    VendorPaymentFactory(vendor_bill=bill, amount=Decimal("10.00"))

    response = api_client.post(f"/api/v1/admin/procurement/vendor-bills/{bill.id}/void/")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "bill_has_payments"


def test_void_vendor_bill_returns_404_for_unknown_id(api_client):
    _admin(api_client, "bill-void-404@example.com")

    response = api_client.post(f"/api/v1/admin/procurement/vendor-bills/{uuid4()}/void/")

    assert response.status_code == 404
    assert response.data["error"]["code"] == "vendor_bill_not_found"


def test_invoices_manage_permission_unlocks_vendor_bills(api_client):
    api_client.force_authenticate(
        user=_staff("bill-invoices@example.com", StaffPermissionCode.INVOICES_MANAGE)
    )
    bill = _matched_bill()

    assert api_client.get("/api/v1/admin/procurement/vendor-bills/").status_code == 200
    assert (
        api_client.post(f"/api/v1/admin/procurement/vendor-bills/{bill.id}/void/").status_code
        == 200
    )


def test_vendor_payment_list_filters_by_bill_and_date(api_client):
    _admin(api_client, "payment-list@example.com")
    bill = _matched_bill()
    payment = VendorPaymentFactory(
        vendor_bill=bill, amount=Decimal("5.00"), paid_at=datetime(2026, 2, 10, tzinfo=UTC)
    )
    VendorPaymentFactory(paid_at=datetime(2026, 2, 10, tzinfo=UTC))

    response = api_client.get(
        "/api/v1/admin/procurement/vendor-payments/",
        {"vendor_bill_id": str(bill.id), "start": "2026-02-01", "end": "2026-02-28"},
    )

    assert response.status_code == 200
    assert response.data["data"]["count"] == 1
    assert response.data["data"]["results"][0]["id"] == str(payment.id)

    empty = api_client.get(
        "/api/v1/admin/procurement/vendor-payments/", {"start": "2026-03-01", "end": "2026-03-31"}
    )
    assert empty.data["data"]["count"] == 0


def test_vendor_payment_detail_and_404(api_client):
    _admin(api_client, "payment-detail@example.com")
    payment = VendorPaymentFactory()

    response = api_client.get(f"/api/v1/admin/procurement/vendor-payments/{payment.id}/")
    assert response.status_code == 200
    assert response.data["data"]["id"] == str(payment.id)

    missing = api_client.get(f"/api/v1/admin/procurement/vendor-payments/{uuid4()}/")
    assert missing.status_code == 404
    assert missing.data["error"]["code"] == "vendor_payment_not_found"


def test_vendor_payment_list_readable_with_view_only_permission(api_client):
    api_client.force_authenticate(
        user=_staff("payment-view@example.com", StaffPermissionCode.ACCOUNTING_VIEW)
    )

    response = api_client.get("/api/v1/admin/procurement/vendor-payments/")

    assert response.status_code == 200


def test_vendor_payment_list_denied_without_permission(api_client):
    api_client.force_authenticate(
        user=_staff("payment-perm@example.com", StaffPermissionCode.INVENTORY_VIEW)
    )

    response = api_client.get("/api/v1/admin/procurement/vendor-payments/")

    assert response.status_code == 403


def test_delete_supplier_soft_deletes(api_client):
    _admin(api_client, "supplier-del@example.com")
    supplier = SupplierFactory()

    response = api_client.delete(f"/api/v1/admin/procurement/suppliers/{supplier.id}/")

    assert response.status_code == 204
    supplier.refresh_from_db()
    assert supplier.deleted_at is not None
    assert api_client.get("/api/v1/admin/procurement/suppliers/").data["data"]["count"] == 0


def test_delete_supplier_blocked_when_referenced(api_client):
    _admin(api_client, "supplier-del-inuse@example.com")
    supplier = SupplierFactory()
    PurchaseOrderFactory(supplier=supplier)

    response = api_client.delete(f"/api/v1/admin/procurement/suppliers/{supplier.id}/")

    assert response.status_code == 409
    assert response.data["error"]["code"] == "supplier_in_use"


def test_delete_supplier_returns_404_for_unknown_id(api_client):
    _admin(api_client, "supplier-del-404@example.com")

    response = api_client.delete(f"/api/v1/admin/procurement/suppliers/{uuid4()}/")

    assert response.status_code == 404
    assert response.data["error"]["code"] == "supplier_not_found"


def test_delete_supplier_requires_manage_permission(api_client):
    api_client.force_authenticate(
        user=_staff("supplier-del-perm@example.com", StaffPermissionCode.PURCHASING_VIEW)
    )
    supplier = SupplierFactory()

    response = api_client.delete(f"/api/v1/admin/procurement/suppliers/{supplier.id}/")

    assert response.status_code == 403


def test_restore_supplier(api_client):
    _admin(api_client, "supplier-restore@example.com")
    supplier = SupplierFactory()
    api_client.delete(f"/api/v1/admin/procurement/suppliers/{supplier.id}/")

    response = api_client.post(f"/api/v1/admin/procurement/suppliers/{supplier.id}/restore/")

    assert response.status_code == 200
    supplier.refresh_from_db()
    assert supplier.deleted_at is None


def test_restore_supplier_returns_404_for_unknown_id(api_client):
    _admin(api_client, "supplier-restore-404@example.com")

    response = api_client.post(f"/api/v1/admin/procurement/suppliers/{uuid4()}/restore/")

    assert response.status_code == 404
    assert response.data["error"]["code"] == "supplier_not_found"


def test_supplier_list_include_deleted(api_client):
    _admin(api_client, "supplier-incdel@example.com")
    supplier = SupplierFactory()
    api_client.delete(f"/api/v1/admin/procurement/suppliers/{supplier.id}/")

    response = api_client.get("/api/v1/admin/procurement/suppliers/", {"include_deleted": "true"})

    assert response.status_code == 200
    assert response.data["data"]["count"] == 1


def test_include_deleted_requires_manage_permission(api_client):
    api_client.force_authenticate(
        user=_staff("supplier-incdel-perm@example.com", StaffPermissionCode.PURCHASING_VIEW)
    )

    response = api_client.get("/api/v1/admin/procurement/suppliers/", {"include_deleted": "true"})

    assert response.status_code == 403


def test_goods_receipts_are_gated_on_purchasing_not_inventory(api_client):
    api_client.force_authenticate(
        user=_staff("grn-inventory@example.com", StaffPermissionCode.INVENTORY_MANAGE)
    )
    assert api_client.get("/api/v1/admin/procurement/goods-receipts/").status_code == 403

    api_client.force_authenticate(
        user=_staff("grn-purchasing@example.com", StaffPermissionCode.PURCHASING_VIEW)
    )
    assert api_client.get("/api/v1/admin/procurement/goods-receipts/").status_code == 200


def test_goods_receipt_create_requires_purchasing_manage(api_client):
    api_client.force_authenticate(
        user=_staff("grn-create-perm@example.com", StaffPermissionCode.PURCHASING_VIEW)
    )

    response = api_client.post("/api/v1/admin/procurement/goods-receipts/", {}, format="json")

    assert response.status_code == 403


def test_purchase_order_list_exposes_human_labels_without_n_plus_one(api_client):
    admin = create_user(email="proc-po-labels@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    supplier = SupplierFactory(name="Label Supplier")
    purchase_order = PurchaseOrderFactory(supplier=supplier)
    variant = ProductVariantFactory(sku="SKU-PO-LABEL")
    PurchaseOrderLineFactory(purchase_order=purchase_order, variant=variant)

    with CaptureQueriesContext(connection) as single_row:
        response = api_client.get("/api/v1/admin/procurement/purchase-orders/")

    assert response.status_code == 200
    row = response.data["data"]["results"][0]
    assert row["supplier_name"] == "Label Supplier"
    assert row["lines"][0]["variant_sku"] == "SKU-PO-LABEL"
    assert row["lines"][0]["product_name"] == variant.product.name

    for _ in range(3):
        PurchaseOrderLineFactory(purchase_order=PurchaseOrderFactory(supplier=supplier))
    with CaptureQueriesContext(connection) as many_rows:
        api_client.get("/api/v1/admin/procurement/purchase-orders/")

    assert len(many_rows) == len(single_row)


def test_vendor_bill_list_exposes_human_labels_without_n_plus_one(api_client):
    admin = create_user(email="proc-bill-labels@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    supplier = SupplierFactory(name="Bill Supplier")
    purchase_order = PurchaseOrderFactory(supplier=supplier, po_number="PO-LABEL-01")
    bill = VendorBillFactory(
        supplier=supplier, purchase_order=purchase_order, bill_number="BILL-LABEL-01"
    )
    VendorPaymentFactory(vendor_bill=bill)

    with CaptureQueriesContext(connection) as single_row:
        response = api_client.get("/api/v1/admin/procurement/vendor-bills/")

    assert response.status_code == 200
    row = response.data["data"]["results"][0]
    assert row["supplier_name"] == "Bill Supplier"
    assert row["purchase_order_number"] == "PO-LABEL-01"
    assert row["payments"][0]["vendor_bill_number"] == "BILL-LABEL-01"

    for _ in range(3):
        VendorPaymentFactory(vendor_bill=VendorBillFactory(supplier=supplier))
    with CaptureQueriesContext(connection) as many_rows:
        api_client.get("/api/v1/admin/procurement/vendor-bills/")

    assert len(many_rows) == len(single_row)


def test_vendor_payment_list_exposes_bill_number_without_n_plus_one(api_client):
    admin = create_user(email="proc-payment-labels@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    bill = VendorBillFactory(bill_number="BILL-LABEL-02")
    VendorPaymentFactory(vendor_bill=bill)

    with CaptureQueriesContext(connection) as single_row:
        response = api_client.get("/api/v1/admin/procurement/vendor-payments/")

    assert response.status_code == 200
    assert response.data["data"]["results"][0]["vendor_bill_number"] == "BILL-LABEL-02"

    VendorPaymentFactory.create_batch(3)
    with CaptureQueriesContext(connection) as many_rows:
        api_client.get("/api/v1/admin/procurement/vendor-payments/")

    assert len(many_rows) == len(single_row)


def test_goods_receipt_list_exposes_human_labels_without_n_plus_one(api_client):
    admin = create_user(email="proc-grn-labels@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    purchase_order = PurchaseOrderFactory(po_number="PO-LABEL-02")
    GoodsReceiptNoteFactory(purchase_order=purchase_order)

    with CaptureQueriesContext(connection) as single_row:
        response = api_client.get("/api/v1/admin/procurement/goods-receipts/")

    assert response.status_code == 200
    row = response.data["data"]["results"][0]
    assert row["purchase_order_number"] == "PO-LABEL-02"

    GoodsReceiptNoteFactory.create_batch(3)
    with CaptureQueriesContext(connection) as many_rows:
        api_client.get("/api/v1/admin/procurement/goods-receipts/")

    assert len(many_rows) == len(single_row)


def test_purchase_order_lines_expose_product_image_without_n_plus_one(api_client):
    admin = create_user(email="proc-po-image@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    supplier = SupplierFactory(name="Image Supplier")
    variant = ProductVariantFactory(sku="SKU-PO-IMG")
    ProductImageFactory(product=variant.product, url="https://img.test/po.jpg", sort_order=0)
    PurchaseOrderLineFactory(
        purchase_order=PurchaseOrderFactory(supplier=supplier),
        variant=variant,
    )

    with CaptureQueriesContext(connection) as single_row:
        response = api_client.get("/api/v1/admin/procurement/purchase-orders/")

    assert response.status_code == 200
    assert (
        response.data["data"]["results"][0]["lines"][0]["product_image"]
        == "https://img.test/po.jpg"
    )

    for _ in range(3):
        other = ProductVariantFactory()
        ProductImageFactory(product=other.product)
        PurchaseOrderLineFactory(
            purchase_order=PurchaseOrderFactory(supplier=supplier),
            variant=other,
        )
    with CaptureQueriesContext(connection) as many_rows:
        api_client.get("/api/v1/admin/procurement/purchase-orders/")

    assert len(many_rows) == len(single_row)


def test_vendor_payment_export_returns_filtered_csv(api_client):
    _admin(api_client, "payment-export@example.com")
    bill = _matched_bill()
    VendorPaymentFactory(vendor_bill=bill, amount=Decimal("5.00"), method="bank", reference="TX-1")
    VendorPaymentFactory(method="cash", reference="TX-2")

    response = api_client.get(
        "/api/v1/admin/procurement/vendor-payments/export/", {"method": "bank"}
    )

    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/csv")
    lines = response.content.decode().splitlines()
    assert lines[0] == "paid_at,vendor_bill_number,amount,method,reference"
    assert len(lines) == 2
    assert bill.bill_number in lines[1]
    assert "TX-1" in lines[1]


def test_staff_without_permission_cannot_export_vendor_payments(api_client):
    api_client.force_authenticate(
        user=create_user(email="payment-export-staff@example.com", role=UserRole.STAFF)
    )

    response = api_client.get("/api/v1/admin/procurement/vendor-payments/export/")

    assert response.status_code == 403
