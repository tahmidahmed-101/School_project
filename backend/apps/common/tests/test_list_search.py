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


def test_stock_item_search_by_product_code_finds_that_product_only(admin_client):
    wanted = ProductVariantFactory()
    code = wanted.product.product_code
    StockItemFactory(variant=wanted)
    # Another product whose SKU happens to contain the same digits.
    StockItemFactory(variant=ProductVariantFactory(sku=f"OTHER-{code}"))

    results = _results(admin_client.get("/api/v1/admin/inventory/stock-items/", {"search": code}))

    assert [str(row["variant_id"]) for row in results] == [str(wanted.id)]


def test_product_search_by_code_finds_that_product_only(admin_client):
    wanted = ProductFactory()
    ProductFactory(name=f"Other {wanted.product_code}")

    results = _results(
        admin_client.get("/api/v1/admin/catalog/products/", {"search": wanted.product_code})
    )

    assert [row["id"] for row in results] == [str(wanted.id)]


def test_variant_search_by_code_finds_that_products_variants_only(admin_client):
    wanted = ProductVariantFactory()
    code = wanted.product.product_code
    ProductVariantFactory(sku=f"OTHER-{code}")

    results = _results(admin_client.get("/api/v1/admin/catalog/variants/", {"search": code}))

    assert [row["id"] for row in results] == [str(wanted.id)]


def test_stock_item_search_by_code_of_a_product_without_stock_finds_nothing(admin_client):
    code = ProductVariantFactory().product.product_code
    StockItemFactory(variant=ProductVariantFactory(sku=f"OTHER-{code}"))

    results = _results(admin_client.get("/api/v1/admin/inventory/stock-items/", {"search": code}))

    assert results == []


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
    ProductVariantFactory(product=product, sku="NEEDLE-VARIANT")
    ProductVariantFactory(product=product, sku="OTHER-VARIANT")

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


def test_variant_list_for_a_warehouse_lists_what_it_holds_with_its_own_count(admin_client):
    from apps.inventory.models import Warehouse

    source = Warehouse.objects.create(name="Source WH", code="SRC-WH")
    other = Warehouse.objects.create(name="Other WH", code="OTH-WH")
    held = ProductVariantFactory()
    StockItemFactory(variant=held, warehouse=source, quantity_on_hand=5, quantity_reserved=2)
    StockItemFactory(variant=held, warehouse=other, quantity_on_hand=40)
    # Elsewhere only, or all of it reserved: nothing this warehouse can give.
    StockItemFactory(variant=ProductVariantFactory(), warehouse=other, quantity_on_hand=9)
    StockItemFactory(
        variant=ProductVariantFactory(), warehouse=source, quantity_on_hand=3, quantity_reserved=3
    )

    results = _results(
        admin_client.get("/api/v1/admin/catalog/variants/", {"warehouse_id": str(source.id)})
    )

    assert [(row["id"], row["stock"]) for row in results] == [(str(held.id), 3)]
