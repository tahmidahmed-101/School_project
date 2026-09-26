from __future__ import annotations

import pytest

from apps.accounting.factories import JournalEntryFactory
from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductFactory, ProductVariantFactory
from apps.inventory.factories import StockItemFactory, StockLedgerEntryFactory
from apps.orders.factories import ShipmentFactory
from apps.procurement.factories import GoodsReceiptNoteFactory, PurchaseOrderFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


def _results(response):
    assert response.status_code == 200
    return response.data["data"]["results"]


def test_journal_entry_search_filters_by_description(admin_client):
    JournalEntryFactory(description="Salary accrual for March")
    JournalEntryFactory(description="Stock write-off")

    results = _results(
        admin_client.get("/api/v1/admin/accounting/journal-entries/", {"search": "salary"})
    )

    assert [entry["description"] for entry in results] == ["Salary accrual for March"]


def test_staff_search_filters_by_email(admin_client):
    create_user(email="needle.staff@example.com", role=UserRole.STAFF)
    create_user(email="other.staff@example.com", role=UserRole.STAFF)

    results = _results(admin_client.get("/api/v1/admin/staff/", {"search": "needle"}))

    assert [user["email"] for user in results] == ["needle.staff@example.com"]


def test_stock_item_search_filters_by_variant_sku(admin_client):
    StockItemFactory(variant=ProductVariantFactory(sku="NEEDLE-SKU"))
    StockItemFactory(variant=ProductVariantFactory(sku="OTHER-SKU"))

    results = _results(
        admin_client.get("/api/v1/admin/inventory/stock-items/", {"search": "needle"})
    )

    assert len(results) == 1


def test_ledger_entry_search_filters_by_variant_sku(admin_client):
    StockLedgerEntryFactory(variant=ProductVariantFactory(sku="NEEDLE-LEDGER"))
    StockLedgerEntryFactory(variant=ProductVariantFactory(sku="OTHER-LEDGER"))

    results = _results(
        admin_client.get("/api/v1/admin/inventory/ledger-entries/", {"search": "needle"})
    )

    assert len(results) == 1


def test_ledger_export_honours_search(admin_client):
    StockLedgerEntryFactory(variant=ProductVariantFactory(sku="NEEDLE-EXPORT"))
    StockLedgerEntryFactory(variant=ProductVariantFactory(sku="OTHER-EXPORT"))

    response = admin_client.get(
        "/api/v1/admin/inventory/ledger-entries/export/", {"search": "needle-export"}
    )

    assert response.status_code == 200
    body = response.content.decode()
    assert "NEEDLE-EXPORT" in body
    assert "OTHER-EXPORT" not in body


def test_product_variant_search_filters_by_sku(admin_client):
    product = ProductFactory()
    ProductVariantFactory(product=product, sku="NEEDLE-VARIANT", size="M")
    ProductVariantFactory(product=product, sku="OTHER-VARIANT", size="L")

    results = _results(
        admin_client.get(
            f"/api/v1/admin/catalog/products/{product.id}/variants/", {"search": "needle"}
        )
    )

    assert [variant["sku"] for variant in results] == ["NEEDLE-VARIANT"]


def test_goods_receipt_search_filters_by_po_number(admin_client):
    GoodsReceiptNoteFactory(purchase_order=PurchaseOrderFactory(po_number="PO-NEEDLE"))
    GoodsReceiptNoteFactory(purchase_order=PurchaseOrderFactory(po_number="PO-OTHER"))

    results = _results(
        admin_client.get("/api/v1/admin/procurement/goods-receipts/", {"search": "needle"})
    )

    assert [grn["purchase_order_number"] for grn in results] == ["PO-NEEDLE"]


def test_shipment_search_filters_by_tracking_number(admin_client):
    ShipmentFactory(tracking_number="TRACK-NEEDLE")
    ShipmentFactory(tracking_number="TRACK-OTHER")

    results = _results(admin_client.get("/api/v1/admin/orders/shipments/", {"search": "needle"}))

    assert [shipment["tracking_number"] for shipment in results] == ["TRACK-NEEDLE"]
