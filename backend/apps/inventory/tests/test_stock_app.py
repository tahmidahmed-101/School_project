from __future__ import annotations

from decimal import Decimal

import pytest

from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import CategoryFactory, ProductVariantFactory
from apps.inventory.constants import MovementType
from apps.inventory.models import StockItem
from apps.inventory.services.stock import record_movement

pytestmark = pytest.mark.django_db


def _staff_with_permission(permission_code, *, email="stock-app-staff@example.com"):
    staff = create_user(email=email, role=UserRole.STAFF)
    admin = create_user(email="stock-app-grantor@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=permission_code,
        is_enabled=True,
        granted_by=admin,
    )
    return staff


def test_lookup_requires_view_permission(api_client):
    staff = create_user(email="stock-app-no-perm@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)

    response = api_client.get("/api/v1/admin/inventory/lookup/", {"q": "SKU-123"})

    assert response.status_code == 403


def test_lookup_by_sku_returns_variant_with_stock(api_client):
    staff = _staff_with_permission(StaffPermissionCode.INVENTORY_VIEW)
    api_client.force_authenticate(user=staff)

    variant = ProductVariantFactory(sku="SKU-ABC", barcode="")
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=14,
        unit_cost=Decimal("5.00"),
    )

    response = api_client.get("/api/v1/admin/inventory/lookup/", {"q": "sku-abc"})

    assert response.status_code == 200
    data = response.data["data"]
    assert data["found"] is True
    assert data["variant_id"] == str(variant.id)
    assert data["sku"] == "SKU-ABC"
    assert data["available"] == 14


def test_lookup_by_barcode_returns_variant(api_client):
    staff = _staff_with_permission(StaffPermissionCode.INVENTORY_VIEW)
    api_client.force_authenticate(user=staff)

    variant = ProductVariantFactory(sku="SKU-BAR", barcode="987654321")
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=7,
        unit_cost=Decimal("5.00"),
    )

    response = api_client.get("/api/v1/admin/inventory/lookup/", {"q": variant.barcode})

    assert response.status_code == 200
    data = response.data["data"]
    assert data["found"] is True
    assert data["variant_id"] == str(variant.id)
    assert data["available"] == 7


def test_lookup_unknown_returns_not_found(api_client):
    staff = _staff_with_permission(StaffPermissionCode.INVENTORY_VIEW)
    api_client.force_authenticate(user=staff)

    response = api_client.get("/api/v1/admin/inventory/lookup/", {"q": "NOPE-123"})

    assert response.status_code == 200
    assert response.data["data"] == {"found": False, "query": "NOPE-123"}


def test_lookup_missing_query_returns_error(api_client):
    staff = _staff_with_permission(StaffPermissionCode.INVENTORY_VIEW)
    api_client.force_authenticate(user=staff)

    response = api_client.get("/api/v1/admin/inventory/lookup/")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "missing_query"


def test_intake_requires_manage_permission(api_client):
    staff = create_user(email="stock-app-intake-denied@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)

    variant = ProductVariantFactory()

    response = api_client.post(
        "/api/v1/admin/inventory/intake/",
        {"variant_id": str(variant.id), "quantity": 5},
    )

    assert response.status_code == 403


def test_intake_posts_purchase_in_and_updates_stock_item(api_client):
    staff = _staff_with_permission(
        StaffPermissionCode.INVENTORY_MANAGE, email="stock-app-intake@example.com"
    )
    api_client.force_authenticate(user=staff)

    variant = ProductVariantFactory()

    response = api_client.post(
        "/api/v1/admin/inventory/intake/",
        {
            "variant_id": str(variant.id),
            "quantity": 12,
            "unit_cost": "6.25",
            "notes": "First intake",
        },
    )

    assert response.status_code == 201
    data = response.data["data"]
    assert data["movement_type"] == MovementType.PURCHASE_IN
    assert data["quantity"] == 12
    assert data["balance_after"] == 12
    assert data["reference_type"] == "stock_intake"

    stock_item = StockItem.objects.get(variant=variant)
    assert stock_item.quantity_on_hand == 12


def test_intake_unknown_variant_returns_error(api_client):
    staff = _staff_with_permission(
        StaffPermissionCode.INVENTORY_MANAGE, email="stock-app-intake-bad@example.com"
    )
    api_client.force_authenticate(user=staff)

    response = api_client.post(
        "/api/v1/admin/inventory/intake/",
        {"variant_id": "00000000-0000-0000-0000-000000000000", "quantity": 5},
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "variant_not_found"


def test_quick_product_create_requires_permission(api_client):
    staff = create_user(email="stock-app-create-denied@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)

    category = CategoryFactory()

    response = api_client.post(
        "/api/v1/admin/inventory/quick-products/",
        {"category_id": str(category.id), "name": "New Item", "sku": "SKU-NEW", "price": "10.00"},
    )

    assert response.status_code == 403


def test_quick_product_create_creates_product_and_variant(api_client):
    staff = _staff_with_permission(
        StaffPermissionCode.CATALOG_MANAGE, email="stock-app-create@example.com"
    )
    api_client.force_authenticate(user=staff)

    category = CategoryFactory(name="Stock App")

    response = api_client.post(
        "/api/v1/admin/inventory/quick-products/",
        {
            "category_id": str(category.id),
            "name": "Widget Pro",
            "sku": "SKU-WIDGET",
            "price": "29.99",
            "cost_price": "9.99",
            "barcode": "4006381333931",
        },
    )

    assert response.status_code == 201
    data = response.data["data"]
    assert data["found"] is True
    assert data["sku"] == "SKU-WIDGET"
    assert data["product_name"] == "Widget Pro"
    assert data["price"] == "29.99"
    assert data["available"] == 0


def test_quick_product_create_unknown_category_returns_error(api_client):
    staff = _staff_with_permission(
        StaffPermissionCode.INVENTORY_MANAGE, email="stock-app-create-badcat@example.com"
    )
    api_client.force_authenticate(user=staff)

    response = api_client.post(
        "/api/v1/admin/inventory/quick-products/",
        {
            "category_id": "00000000-0000-0000-0000-000000000000",
            "name": "No Cat",
            "sku": "SKU-NOCAT",
            "price": "10.00",
        },
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "category_not_found"


def test_quick_product_create_duplicate_sku_returns_error(api_client):
    staff = _staff_with_permission(
        StaffPermissionCode.INVENTORY_MANAGE, email="stock-app-create-dupe@example.com"
    )
    api_client.force_authenticate(user=staff)

    category = CategoryFactory()
    ProductVariantFactory(sku="SKU-DUPE")

    response = api_client.post(
        "/api/v1/admin/inventory/quick-products/",
        {
            "category_id": str(category.id),
            "name": "Dupe",
            "sku": "SKU-DUPE",
            "price": "10.00",
        },
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "duplicate_sku"
