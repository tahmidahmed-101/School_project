from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounting.tests.helpers import seed_chart_of_accounts
from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductImageFactory, ProductVariantFactory
from apps.inventory.constants import MovementType
from apps.inventory.factories import StockItemFactory, StockLedgerEntryFactory
from apps.inventory.models import StockItem, Warehouse
from apps.inventory.services.stock import record_movement

pytestmark = pytest.mark.django_db


def test_staff_without_permission_cannot_view_stock_items(api_client):
    staff = create_user(email="inv-staff@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)

    response = api_client.get("/api/v1/admin/inventory/stock-items/")

    assert response.status_code == 403


def test_staff_with_view_permission_can_list_stock_items(api_client):
    staff = create_user(email="inv-staff-view@example.com", role=UserRole.STAFF)
    admin = create_user(email="inv-grantor@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.INVENTORY_VIEW,
        is_enabled=True,
        granted_by=admin,
    )
    api_client.force_authenticate(user=staff)

    variant = ProductVariantFactory()
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("5.00"),
    )

    response = api_client.get("/api/v1/admin/inventory/stock-items/")

    assert response.status_code == 200
    assert response.data["data"]["count"] == 1


def test_stock_item_list_filters_by_warehouse_without_creating_placeholder_rows(api_client):
    admin = create_user(email="inv-warehouse-filter-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    variant = ProductVariantFactory()
    main_warehouse = Warehouse.objects.create(
        name="Main Test Warehouse",
        code="MAIN-TEST",
        is_default=True,
    )
    empty_warehouse = Warehouse.objects.create(
        name="Empty Test Warehouse",
        code="EMPTY-TEST",
    )
    StockItemFactory(variant=variant, warehouse=main_warehouse, quantity_on_hand=8)

    main_response = api_client.get(
        f"/api/v1/admin/inventory/stock-items/?warehouse_id={main_warehouse.id}"
    )
    empty_response = api_client.get(
        f"/api/v1/admin/inventory/stock-items/?warehouse_id={empty_warehouse.id}"
    )

    assert main_response.status_code == 200
    assert main_response.data["data"]["count"] == 1
    assert main_response.data["data"]["results"][0]["warehouse_name"] == main_warehouse.name

    assert empty_response.status_code == 200
    assert empty_response.data["data"]["count"] == 0
    assert not StockItem.objects.filter(warehouse=empty_warehouse).exists()


def test_new_warehouse_created_via_api_is_visible_when_filtered(api_client):
    """A warehouse created through the admin endpoint must show up (at 0 on
    hand) when the stock list is filtered to it, even before any movement —
    otherwise the warehouse filter looks broken for every warehouse but the
    default one."""
    admin = create_user(email="inv-new-warehouse-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    ProductVariantFactory()

    create_response = api_client.post(
        "/api/v1/admin/inventory/warehouses/",
        {"name": "Branch Warehouse", "code": "BRANCH-1"},
    )
    assert create_response.status_code == 201
    warehouse_id = create_response.data["data"]["id"]

    list_response = api_client.get(
        f"/api/v1/admin/inventory/stock-items/?warehouse_id={warehouse_id}"
    )

    assert list_response.status_code == 200
    assert list_response.data["data"]["count"] == 1
    assert list_response.data["data"]["results"][0]["quantity_on_hand"] == 0


def test_view_only_staff_cannot_post_adjustment(api_client):
    staff = create_user(email="inv-staff-view-only@example.com", role=UserRole.STAFF)
    admin = create_user(email="inv-grantor-2@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.INVENTORY_VIEW,
        is_enabled=True,
        granted_by=admin,
    )
    api_client.force_authenticate(user=staff)

    variant = ProductVariantFactory()

    response = api_client.post(
        "/api/v1/admin/inventory/adjustments/",
        {"variant_id": str(variant.id), "quantity_delta": 5},
    )

    assert response.status_code == 403


def test_manage_staff_can_post_adjustment(api_client):
    seed_chart_of_accounts()
    staff = create_user(email="inv-staff-manage@example.com", role=UserRole.STAFF)
    admin = create_user(email="inv-grantor-3@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.INVENTORY_MANAGE,
        is_enabled=True,
        granted_by=admin,
    )
    api_client.force_authenticate(user=staff)

    variant = ProductVariantFactory()

    response = api_client.post(
        "/api/v1/admin/inventory/adjustments/",
        {"variant_id": str(variant.id), "quantity_delta": 5},
    )

    assert response.status_code == 201
    assert response.data["data"]["movement_type"] == MovementType.ADJUSTMENT_IN
    assert response.data["data"]["balance_after"] == 5


def test_adjustment_with_insufficient_stock_returns_error(api_client):
    staff = create_user(email="inv-staff-manage-2@example.com", role=UserRole.STAFF)
    admin = create_user(email="inv-grantor-4@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.INVENTORY_MANAGE,
        is_enabled=True,
        granted_by=admin,
    )
    api_client.force_authenticate(user=staff)

    variant = ProductVariantFactory()

    response = api_client.post(
        "/api/v1/admin/inventory/adjustments/",
        {"variant_id": str(variant.id), "quantity_delta": -5},
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "insufficient_stock"


def test_staff_with_adjust_permission_can_post_adjustment(api_client):
    seed_chart_of_accounts()
    staff = create_user(email="inv-staff-adjust@example.com", role=UserRole.STAFF)
    admin = create_user(email="inv-grantor-adjust@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.INVENTORY_ADJUST,
        is_enabled=True,
        granted_by=admin,
    )
    api_client.force_authenticate(user=staff)

    variant = ProductVariantFactory()

    response = api_client.post(
        "/api/v1/admin/inventory/adjustments/",
        {"variant_id": str(variant.id), "quantity_delta": 4},
    )

    assert response.status_code == 201
    assert response.data["data"]["movement_type"] == MovementType.ADJUSTMENT_IN
    assert response.data["data"]["balance_after"] == 4


def test_staff_without_adjust_permission_cannot_write_off(api_client):
    staff = create_user(email="inv-staff-no-writeoff@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)

    variant = ProductVariantFactory()

    response = api_client.post(
        "/api/v1/admin/inventory/write-offs/",
        {"variant_id": str(variant.id), "quantity": 5},
    )

    assert response.status_code == 403


def test_staff_with_adjust_permission_can_write_off(api_client):
    seed_chart_of_accounts()
    staff = create_user(email="inv-staff-writeoff@example.com", role=UserRole.STAFF)
    admin = create_user(email="inv-grantor-writeoff@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.INVENTORY_ADJUST,
        is_enabled=True,
        granted_by=admin,
    )
    api_client.force_authenticate(user=staff)

    variant = ProductVariantFactory()
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("5.00"),
    )

    response = api_client.post(
        "/api/v1/admin/inventory/write-offs/",
        {"variant_id": str(variant.id), "quantity": 3},
    )

    assert response.status_code == 201
    assert response.data["data"]["movement_type"] == MovementType.WRITE_OFF
    assert response.data["data"]["balance_after"] == 7


@pytest.mark.parametrize("use_default", [True, False])
def test_stock_movements_accept_warehouse_id(api_client, use_default):
    """The dashboard always sends `warehouse_id` (null = default warehouse);
    intake, adjustment and write-off must all accept it."""
    seed_chart_of_accounts()
    admin = create_user(email="inv-warehouse-id-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    default = Warehouse.objects.create(name="Default WH", code="DEF-WH", is_default=True)
    branch = Warehouse.objects.create(name="Branch WH", code="BR-WH")
    warehouse = default if use_default else branch
    variant = ProductVariantFactory()
    base = {
        "variant_id": str(variant.id),
        "warehouse_id": None if use_default else str(branch.id),
    }

    intake = api_client.post(
        "/api/v1/admin/inventory/intake/",
        {**base, "quantity": 10, "unit_cost": "5.00"},
        format="json",
    )
    adjustment = api_client.post(
        "/api/v1/admin/inventory/adjustments/",
        {**base, "quantity_delta": -2, "unit_cost": None, "notes": ""},
        format="json",
    )
    write_off = api_client.post(
        "/api/v1/admin/inventory/write-offs/",
        {**base, "quantity": 3, "reason": ""},
        format="json",
    )

    assert intake.status_code == 201
    assert adjustment.status_code == 201
    assert write_off.status_code == 201
    assert str(write_off.data["data"]["warehouse_id"]) == str(warehouse.id)
    assert write_off.data["data"]["balance_after"] == 5


def test_view_staff_can_read_stock_status_summary(api_client):
    staff = create_user(email="inv-staff-status@example.com", role=UserRole.STAFF)
    admin = create_user(email="inv-grantor-status@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.INVENTORY_VIEW,
        is_enabled=True,
        granted_by=admin,
    )
    api_client.force_authenticate(user=staff)

    variant = ProductVariantFactory()
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("5.00"),
    )

    response = api_client.get("/api/v1/admin/inventory/stock-status/")

    assert response.status_code == 200
    assert response.data["data"]["sellable"] == 10
    assert set(response.data["data"]) == {
        "sellable",
        "reserved",
        "in_transit",
        "quarantine",
        "pending_return_inspection",
        "written_off",
    }


def test_staff_without_permission_cannot_read_stock_status_summary(api_client):
    staff = create_user(email="inv-staff-status-denied@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)

    response = api_client.get("/api/v1/admin/inventory/stock-status/")

    assert response.status_code == 403


def test_stock_item_detail_returns_item(api_client):
    admin = create_user(email="inv-item-detail@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    variant = ProductVariantFactory()
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=7,
        unit_cost=Decimal("2.00"),
    )
    stock_item = StockItem.objects.get(variant=variant)

    response = api_client.get(f"/api/v1/admin/inventory/stock-items/{stock_item.id}/")

    assert response.status_code == 200
    assert response.data["data"]["quantity_on_hand"] == 7


def test_stock_item_detail_returns_404_for_unknown_id(api_client):
    admin = create_user(email="inv-item-detail-404@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.get(f"/api/v1/admin/inventory/stock-items/{uuid4()}/")

    assert response.status_code == 404
    assert response.data["error"]["code"] == "stock_item_not_found"


def test_stock_item_detail_denied_without_permission(api_client):
    staff = create_user(email="inv-item-detail-denied@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)

    response = api_client.get(f"/api/v1/admin/inventory/stock-items/{uuid4()}/")

    assert response.status_code == 403


def test_bulk_adjustment_loads_variants_in_one_query(api_client):
    seed_chart_of_accounts()
    admin = create_user(email="inv-bulk-scale@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    def variant_selects(count: int) -> int:
        items = [
            {"variant_id": str(ProductVariantFactory().id), "quantity_delta": 2}
            for _ in range(count)
        ]
        with CaptureQueriesContext(connection) as captured:
            response = api_client.post(
                "/api/v1/admin/inventory/adjustments/bulk/", {"adjustments": items}, format="json"
            )
        assert response.status_code == 201, response.data
        return sum(
            1
            for q in captured
            if q["sql"].startswith("SELECT") and 'FROM "catalog_productvariant"' in q["sql"]
        )

    assert variant_selects(6) == variant_selects(1)


def test_bulk_adjustment_applies_every_item(api_client):
    seed_chart_of_accounts()
    admin = create_user(email="inv-bulk-adjust@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    first = ProductVariantFactory()
    second = ProductVariantFactory()

    response = api_client.post(
        "/api/v1/admin/inventory/adjustments/bulk/",
        {
            "adjustments": [
                {"variant_id": str(first.id), "quantity_delta": 5},
                {"variant_id": str(second.id), "quantity_delta": 8},
            ]
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.data["data"]["count"] == 2
    assert StockItem.objects.get(variant=first).quantity_on_hand == 5
    assert StockItem.objects.get(variant=second).quantity_on_hand == 8


def test_bulk_adjustment_rolls_back_whole_batch_on_failure(api_client):
    seed_chart_of_accounts()
    admin = create_user(email="inv-bulk-rollback@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    first = ProductVariantFactory()
    second = ProductVariantFactory()

    response = api_client.post(
        "/api/v1/admin/inventory/adjustments/bulk/",
        {
            "adjustments": [
                {"variant_id": str(first.id), "quantity_delta": 5},
                {"variant_id": str(second.id), "quantity_delta": -99},
            ]
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "insufficient_stock"
    assert not StockItem.objects.filter(variant=first, quantity_on_hand__gt=0).exists()


def test_bulk_adjustment_denied_without_adjust_permission(api_client):
    staff = create_user(email="inv-bulk-denied@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)

    response = api_client.post(
        "/api/v1/admin/inventory/adjustments/bulk/", {"adjustments": []}, format="json"
    )

    assert response.status_code == 403


def test_ledger_export_returns_csv(api_client):
    admin = create_user(email="inv-ledger-export@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    variant = ProductVariantFactory(sku="LEDGER-EXPORT-1")
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=4,
        unit_cost=Decimal("3.00"),
    )

    response = api_client.get("/api/v1/admin/inventory/ledger-entries/export/")

    assert response.status_code == 200
    assert response["Content-Type"] == "text/csv"
    assert b"LEDGER-EXPORT-1" in response.content


def test_ledger_export_honours_variant_filter(api_client):
    admin = create_user(email="inv-ledger-export-filter@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    kept = ProductVariantFactory(sku="LEDGER-EXPORT-KEPT")
    other = ProductVariantFactory(sku="LEDGER-EXPORT-2")
    record_movement(
        variant=other,
        movement_type=MovementType.PURCHASE_IN,
        quantity=4,
        unit_cost=Decimal("3.00"),
    )

    response = api_client.get(
        f"/api/v1/admin/inventory/ledger-entries/export/?variant_id={kept.id}"
    )

    assert response.status_code == 200
    assert b"LEDGER-EXPORT-2" not in response.content


def test_ledger_export_denied_without_permission(api_client):
    staff = create_user(email="inv-ledger-export-denied@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)

    response = api_client.get("/api/v1/admin/inventory/ledger-entries/export/")

    assert response.status_code == 403


def test_stock_item_list_exposes_human_labels_without_n_plus_one(api_client):
    admin = create_user(email="inv-labels@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    variant = ProductVariantFactory(sku="SKU-LABEL-1")
    StockItemFactory(variant=variant)

    with CaptureQueriesContext(connection) as single_row:
        response = api_client.get("/api/v1/admin/inventory/stock-items/")

    assert response.status_code == 200
    row = response.data["data"]["results"][0]
    assert row["variant_sku"] == "SKU-LABEL-1"
    assert row["product_name"] == variant.product.name

    StockItemFactory.create_batch(3)
    with CaptureQueriesContext(connection) as many_rows:
        api_client.get("/api/v1/admin/inventory/stock-items/")

    assert len(many_rows) == len(single_row)


def test_ledger_entry_list_exposes_human_labels_without_n_plus_one(api_client):
    admin = create_user(email="inv-ledger-labels@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    variant = ProductVariantFactory(sku="SKU-LEDGER-1")
    StockLedgerEntryFactory(variant=variant)

    with CaptureQueriesContext(connection) as single_row:
        response = api_client.get("/api/v1/admin/inventory/ledger-entries/")

    assert response.status_code == 200
    row = response.data["data"]["results"][0]
    assert row["variant_sku"] == "SKU-LEDGER-1"
    assert row["product_name"] == variant.product.name

    StockLedgerEntryFactory.create_batch(3)
    with CaptureQueriesContext(connection) as many_rows:
        api_client.get("/api/v1/admin/inventory/ledger-entries/")

    assert len(many_rows) == len(single_row)


def test_stock_item_list_exposes_product_image_without_n_plus_one(api_client):
    admin = create_user(email="inv-image@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    variant = ProductVariantFactory(sku="SKU-IMG-1")
    ProductImageFactory(product=variant.product, url="https://img.test/a.jpg", sort_order=0)
    StockItemFactory(variant=variant)

    with CaptureQueriesContext(connection) as single_row:
        response = api_client.get("/api/v1/admin/inventory/stock-items/")

    assert response.status_code == 200
    assert response.data["data"]["results"][0]["product_image"] == "https://img.test/a.jpg"

    for _ in range(3):
        other = ProductVariantFactory()
        ProductImageFactory(product=other.product)
        StockItemFactory(variant=other)
    with CaptureQueriesContext(connection) as many_rows:
        api_client.get("/api/v1/admin/inventory/stock-items/")

    assert len(many_rows) == len(single_row)


def test_stock_item_delete_blocked_when_holding_quantity(api_client):
    admin = create_user(email="inv-item-delete-blocked@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    stock_item = StockItemFactory(quantity_on_hand=5, quantity_reserved=0)

    response = api_client.delete(f"/api/v1/admin/inventory/stock-items/{stock_item.id}/")

    assert response.status_code == 409
    assert response.data["error"]["code"] == "stock_item_in_use"


def test_stock_item_delete_allowed_when_empty(api_client):
    admin = create_user(email="inv-item-delete-empty@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    stock_item = StockItemFactory(quantity_on_hand=0, quantity_reserved=0)

    response = api_client.delete(f"/api/v1/admin/inventory/stock-items/{stock_item.id}/")

    assert response.status_code == 200
    assert not StockItem.objects.filter(id=stock_item.id).exists()


def test_stock_item_delete_denied_for_view_only_staff(api_client):
    staff = create_user(email="inv-item-delete-denied@example.com", role=UserRole.STAFF)
    admin = create_user(email="inv-item-delete-grantor@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.INVENTORY_VIEW,
        is_enabled=True,
        granted_by=admin,
    )
    api_client.force_authenticate(user=staff)
    stock_item = StockItemFactory(quantity_on_hand=0, quantity_reserved=0)

    response = api_client.delete(f"/api/v1/admin/inventory/stock-items/{stock_item.id}/")

    assert response.status_code == 403


def test_ledger_entry_list_exposes_product_image_without_n_plus_one(api_client):
    admin = create_user(email="inv-ledger-image@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    variant = ProductVariantFactory(sku="SKU-LEDGER-IMG-1")
    ProductImageFactory(product=variant.product, url="https://img.test/b.jpg", sort_order=0)
    StockLedgerEntryFactory(variant=variant)

    with CaptureQueriesContext(connection) as single_row:
        response = api_client.get("/api/v1/admin/inventory/ledger-entries/")

    assert response.status_code == 200
    assert response.data["data"]["results"][0]["product_image"] == "https://img.test/b.jpg"

    for _ in range(3):
        other = ProductVariantFactory()
        ProductImageFactory(product=other.product)
        StockLedgerEntryFactory(variant=other)
    with CaptureQueriesContext(connection) as many_rows:
        api_client.get("/api/v1/admin/inventory/ledger-entries/")

    assert len(many_rows) == len(single_row)


def test_stock_item_list_shows_fresh_variant_without_stock_item(api_client):
    """A newly-created variant with no movement history must still appear in
    Stock Levels so it can be found and stocked: creating it makes its empty
    record in the default warehouse."""
    from apps.catalog.factories import ProductFactory
    from apps.catalog.services.products import create_variant

    admin = create_user(email="inv-fresh@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    variant = create_variant(product=ProductFactory(), sku="SKU-FRESH-1", price=Decimal("10.00"))
    assert StockItem.objects.filter(variant=variant).count() == 1

    response = api_client.get(
        "/api/v1/admin/inventory/stock-items/",
        {"search": "SKU-FRESH-1"},
    )

    assert response.status_code == 200
    results = response.data["data"]["results"]
    assert len(results) == 1
    row = results[0]
    assert row["variant_sku"] == "SKU-FRESH-1"
    assert row["quantity_on_hand"] == 0
    assert row["quantity_reserved"] == 0
    assert row["available"] == 0
    assert StockItem.objects.filter(variant=variant).exists()

    # Reading never adds or duplicates rows.
    api_client.get("/api/v1/admin/inventory/stock-items/")
    assert StockItem.objects.filter(variant=variant).count() == 1


def test_a_deleted_empty_stock_record_stays_deleted(api_client):
    """Loading the Stock page must not put back a record staff just deleted."""
    from apps.catalog.factories import ProductFactory
    from apps.catalog.services.products import create_variant

    admin = create_user(email="inv-delete@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    variant = create_variant(product=ProductFactory(), sku="SKU-GONE-1", price=Decimal("10.00"))
    record = StockItem.objects.get(variant=variant)

    deleted = api_client.delete(f"/api/v1/admin/inventory/stock-items/{record.id}/")
    listed = api_client.get("/api/v1/admin/inventory/stock-items/", {"search": "SKU-GONE-1"})

    assert deleted.status_code == 200
    assert listed.data["data"]["results"] == []
    assert not StockItem.objects.filter(variant=variant).exists()


def test_admin_can_list_and_create_and_manage_warehouses(api_client):
    admin = create_user(email="admin-wh@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    # List warehouses
    resp = api_client.get("/api/v1/admin/inventory/warehouses/")
    assert resp.status_code == 200

    # Create new warehouse
    create_resp = api_client.post(
        "/api/v1/admin/inventory/warehouses/",
        {
            "name": "East Coast DC",
            "code": "ECDC-1",
            "address": "123 Logistics Blvd, NJ",
            "is_active": True,
            "is_default": False,
        },
        format="json",
    )
    assert create_resp.status_code == 201
    wh_id = create_resp.data["data"]["id"]
    assert create_resp.data["data"]["name"] == "East Coast DC"
    assert create_resp.data["data"]["code"] == "ECDC-1"

    # Retrieve detail
    detail_resp = api_client.get(f"/api/v1/admin/inventory/warehouses/{wh_id}/")
    assert detail_resp.status_code == 200
    assert detail_resp.data["data"]["code"] == "ECDC-1"

    # Update warehouse
    patch_resp = api_client.patch(
        f"/api/v1/admin/inventory/warehouses/{wh_id}/",
        {"name": "East Coast Hub"},
        format="json",
    )
    assert patch_resp.status_code == 200
    assert patch_resp.data["data"]["name"] == "East Coast Hub"

    # Delete warehouse
    del_resp = api_client.delete(f"/api/v1/admin/inventory/warehouses/{wh_id}/")
    assert del_resp.status_code == 200

