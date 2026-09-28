from __future__ import annotations

import pytest

from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import (
    CategoryFactory,
    ProductFactory,
    ProductImageFactory,
    ProductVariantFactory,
)
from apps.catalog.models import Product

pytestmark = pytest.mark.django_db


def test_customer_cannot_manage_catalog(api_client):
    customer = create_user(email="catalog-customer@example.com")
    api_client.force_authenticate(user=customer)

    response = api_client.get("/api/v1/admin/catalog/categories/")

    assert response.status_code == 403


def test_admin_can_create_category(api_client):
    admin = create_user(email="catalog-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.post("/api/v1/admin/catalog/categories/", {"name": "Electronics"})

    assert response.status_code == 201
    assert response.data["data"]["slug"] == "electronics"


def test_staff_without_permission_is_forbidden(api_client):
    staff = create_user(email="catalog-staff@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)

    response = api_client.get("/api/v1/admin/catalog/categories/")

    assert response.status_code == 403


def test_staff_with_permission_can_list_categories(api_client):
    staff = create_user(email="catalog-staff-perm@example.com", role=UserRole.STAFF)
    admin = create_user(email="catalog-grantor@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.CATALOG_MANAGE,
        is_enabled=True,
        granted_by=admin,
    )
    api_client.force_authenticate(user=staff)
    CategoryFactory()

    response = api_client.get("/api/v1/admin/catalog/categories/")

    assert response.status_code == 200
    assert response.data["data"]["count"] == 1


def test_public_product_list_hides_inactive_products(api_client):
    active_product = ProductFactory(is_active=True)
    ProductVariantFactory(product=active_product)
    inactive_product = ProductFactory(is_active=False)
    ProductVariantFactory(product=inactive_product)

    response = api_client.get("/api/v1/public/catalog/products/")

    assert response.status_code == 200
    names = [item["name"] for item in response.data["data"]["results"]]
    assert active_product.name in names
    assert inactive_product.name not in names


def test_public_product_list_preorder_only_filter(api_client):
    from datetime import timedelta
    from decimal import Decimal

    from django.utils import timezone

    now = timezone.now()

    preorder_product = ProductFactory(is_active=True)
    ProductVariantFactory(
        product=preorder_product,
        is_preorder_enabled=True,
        preorder_price=Decimal("9.99"),
        preorder_start_date=now - timedelta(days=1),
        preorder_end_date=now + timedelta(days=10),
    )
    regular_product = ProductFactory(is_active=True)
    ProductVariantFactory(product=regular_product)

    response = api_client.get("/api/v1/public/catalog/products/?preorder_only=true")

    assert response.status_code == 200
    names = [item["name"] for item in response.data["data"]["results"]]
    assert preorder_product.name in names
    assert regular_product.name not in names


def test_public_product_detail_by_slug(api_client):
    product = ProductFactory()
    ProductVariantFactory(product=product, sku="DETAIL-1")

    response = api_client.get(f"/api/v1/public/catalog/products/{product.slug}/")

    assert response.status_code == 200
    assert response.data["data"]["slug"] == product.slug
    assert response.data["data"]["variants"][0]["sku"] == "DETAIL-1"


def test_admin_can_generate_variants(api_client):
    admin = create_user(email="catalog-generate-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    product = ProductFactory()

    response = api_client.post(
        f"/api/v1/admin/catalog/products/{product.id}/variants/generate/",
        {"colors": ["Red", "Blue"], "sizes": ["M", "L"], "price": "20.00"},
        format="json",
    )

    assert response.status_code == 201
    created = response.data["data"]["created"]
    assert {(item["color"], item["size"]) for item in created} == {
        ("Red", "M"),
        ("Red", "L"),
        ("Blue", "M"),
        ("Blue", "L"),
    }


def test_global_variant_list_search_by_sku(api_client):
    staff = create_user(email="catalog-variant-viewer@example.com", role=UserRole.STAFF)
    admin = create_user(email="catalog-variant-grantor@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.CATALOG_VIEW,
        is_enabled=True,
        granted_by=admin,
    )
    api_client.force_authenticate(user=staff)
    ProductVariantFactory(sku="FINDME-123")
    ProductVariantFactory(sku="OTHER-456")

    response = api_client.get("/api/v1/admin/catalog/variants/?search=FINDME")

    assert response.status_code == 200
    skus = [item["sku"] for item in response.data["data"]["results"]]
    assert skus == ["FINDME-123"]


def test_admin_product_list_filters_by_status(api_client):
    admin = create_user(email="catalog-status-filter-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    active_product = ProductFactory(name="Active Filter Product", is_active=True)
    inactive_product = ProductFactory(name="Inactive Filter Product", is_active=False)

    inactive_response = api_client.get("/api/v1/admin/catalog/products/?is_active=false")
    active_response = api_client.get("/api/v1/admin/catalog/products/?is_active=true")
    all_response = api_client.get("/api/v1/admin/catalog/products/")

    assert inactive_response.status_code == 200
    inactive_names = [item["name"] for item in inactive_response.data["data"]["results"]]
    assert inactive_names == [inactive_product.name]

    assert active_response.status_code == 200
    active_names = [item["name"] for item in active_response.data["data"]["results"]]
    assert active_names == [active_product.name]

    assert all_response.status_code == 200
    all_names = [item["name"] for item in all_response.data["data"]["results"]]
    assert active_product.name in all_names
    assert inactive_product.name in all_names


def test_admin_product_list_filters_by_category(api_client):
    admin = create_user(email="catalog-category-filter-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    target_category = CategoryFactory(name="Target Category")
    other_category = CategoryFactory(name="Other Category")
    target_product = ProductFactory(name="Target Category Product", category=target_category)
    other_product = ProductFactory(name="Other Category Product", category=other_category)

    response = api_client.get(
        f"/api/v1/admin/catalog/products/?category_id={target_category.id}"
    )

    assert response.status_code == 200
    names = [item["name"] for item in response.data["data"]["results"]]
    assert target_product.name in names
    assert other_product.name not in names


def test_admin_product_list_preorder_only_filter(api_client):
    from datetime import timedelta
    from decimal import Decimal

    from django.utils import timezone

    admin = create_user(email="catalog-preorder-filter-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    now = timezone.now()

    preorder_product = ProductFactory(name="Preorder Filter Product", is_active=True)
    ProductVariantFactory(
        product=preorder_product,
        is_preorder_enabled=True,
        preorder_price=Decimal("19.99"),
        preorder_start_date=now - timedelta(days=1),
        preorder_end_date=now + timedelta(days=7),
    )
    regular_product = ProductFactory(name="Regular Filter Product", is_active=True)
    ProductVariantFactory(product=regular_product)

    response = api_client.get("/api/v1/admin/catalog/products/?preorder_only=true")

    assert response.status_code == 200
    names = [item["name"] for item in response.data["data"]["results"]]
    assert names == [preorder_product.name]


def test_admin_product_list_filters_inactive_preorder_products(api_client):
    from datetime import timedelta
    from decimal import Decimal

    from django.utils import timezone

    admin = create_user(
        email="catalog-inactive-preorder-filter-admin@example.com", role=UserRole.ADMIN
    )
    api_client.force_authenticate(user=admin)
    now = timezone.now()

    inactive_preorder_product = ProductFactory(
        name="Inactive Preorder Filter Product",
        is_active=True,
    )
    ProductVariantFactory(
        product=inactive_preorder_product,
        is_preorder_enabled=True,
        preorder_price=Decimal("29.99"),
        preorder_start_date=now + timedelta(days=1),
        preorder_end_date=now + timedelta(days=14),
    )
    inactive_regular_product = ProductFactory(
        name="Inactive Regular Filter Product", is_active=True
    )
    ProductVariantFactory(product=inactive_regular_product)

    response = api_client.get(
        "/api/v1/admin/catalog/products/?preorder_only=true&preorder_status=inactive"
    )

    assert response.status_code == 200
    names = [item["name"] for item in response.data["data"]["results"]]
    assert names == [inactive_preorder_product.name]


def test_catalog_view_permission_cannot_write(api_client):
    staff = create_user(email="catalog-viewonly-staff@example.com", role=UserRole.STAFF)
    admin = create_user(email="catalog-viewonly-grantor@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.CATALOG_VIEW,
        is_enabled=True,
        granted_by=admin,
    )
    api_client.force_authenticate(user=staff)

    response = api_client.post("/api/v1/admin/catalog/categories/", {"name": "Blocked"})

    assert response.status_code == 403


def test_variant_is_low_stock_uses_reorder_point_not_a_per_variant_field(api_client):
    from apps.inventory.factories import StockItemFactory

    admin = create_user(email="catalog-variant-low-stock@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    variant = ProductVariantFactory()
    StockItemFactory(variant=variant, quantity_on_hand=5, quantity_reserved=0, reorder_point=10)

    response = api_client.get(f"/api/v1/admin/catalog/variants/{variant.id}/")

    assert response.status_code == 200
    data = response.data["data"]
    assert "low_stock_alert" not in data
    assert data["stock"] == 5
    assert data["is_low_stock"] is True


def test_product_delete_soft_deletes_and_cascades_to_variants(api_client):
    admin = create_user(email="catalog-product-delete@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    product = ProductFactory()
    variant = ProductVariantFactory(product=product)

    response = api_client.delete(f"/api/v1/admin/catalog/products/{product.id}/")

    assert response.status_code == 200
    product.refresh_from_db()
    variant.refresh_from_db()
    assert product.deleted_at is not None
    assert variant.deleted_at is not None
    assert variant.is_active is False
    assert api_client.get(f"/api/v1/admin/catalog/products/{product.id}/").status_code == 404

    restore = api_client.post(f"/api/v1/admin/catalog/products/{product.id}/restore/")
    assert restore.status_code == 200
    product.refresh_from_db()
    assert product.deleted_at is None


def test_category_delete_blocked_when_it_has_live_products(api_client):
    admin = create_user(email="catalog-category-delete-blocked@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    category = CategoryFactory()
    ProductFactory(category=category)

    response = api_client.delete(f"/api/v1/admin/catalog/categories/{category.id}/")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "category_has_products"


def test_category_delete_allowed_once_products_are_deleted(api_client):
    admin = create_user(email="catalog-category-delete-ok@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    category = CategoryFactory()
    product = ProductFactory(category=category)
    api_client.delete(f"/api/v1/admin/catalog/products/{product.id}/")

    response = api_client.delete(f"/api/v1/admin/catalog/categories/{category.id}/")

    assert response.status_code == 200


def test_variant_export_returns_csv(api_client):
    admin = create_user(email="catalog-export-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    ProductVariantFactory(sku="EXPORT-1")

    response = api_client.get("/api/v1/admin/catalog/variants/export/?file_format=csv")

    assert response.status_code == 200
    assert response["Content-Type"] == "text/csv"
    assert b"EXPORT-1" in response.content


def test_variant_image_appears_on_variant_not_on_product(api_client):
    admin = create_user(email="catalog-variant-image-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    product = ProductFactory()
    variant = ProductVariantFactory(product=product)

    create_response = api_client.post(
        f"/api/v1/admin/catalog/products/{product.id}/images/",
        {"url": "https://example.com/variant.jpg", "variant_id": str(variant.id)},
    )
    assert create_response.status_code == 201

    variant_response = api_client.get(f"/api/v1/admin/catalog/variants/{variant.id}/")
    assert variant_response.status_code == 200
    variant_images = variant_response.data["data"]["images"]
    assert len(variant_images) == 1
    assert variant_images[0]["url"] == "https://example.com/variant.jpg"

    product_response = api_client.get(f"/api/v1/admin/catalog/products/{product.id}/")
    assert product_response.data["data"]["images"] == []
    # The editable collection stays product-scoped, but the thumbnail falls back
    # to the variant image so the dashboard list is not blank where the shop
    # shows a photo.
    assert product_response.data["data"]["primary_image"] == "https://example.com/variant.jpg"

    list_response = api_client.get("/api/v1/admin/catalog/products/")
    row = next(r for r in list_response.data["data"]["results"] if r["id"] == str(product.id))
    assert row["primary_image"] == "https://example.com/variant.jpg"


def test_admin_can_get_product_image_detail(api_client):
    admin = create_user(email="catalog-image-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    image = ProductImageFactory(url="https://example.com/detail.jpg")

    response = api_client.get(f"/api/v1/admin/catalog/images/{image.id}/")

    assert response.status_code == 200
    assert response.data["data"]["url"] == "https://example.com/detail.jpg"


def test_product_image_detail_404(api_client):
    admin = create_user(email="catalog-image-404@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.get("/api/v1/admin/catalog/images/11111111-1111-1111-1111-111111111111/")

    assert response.status_code == 404
    assert response.data["error"]["code"] == "product_image_not_found"


def test_admin_product_image_alt_text_round_trips(api_client):
    admin = create_user(email="catalog-image-alt@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    product = ProductFactory()

    create_response = api_client.post(
        f"/api/v1/admin/catalog/products/{product.id}/images/",
        {"url": "https://example.com/alt.jpg", "alt_text": "Red canvas sneaker, side view"},
    )

    assert create_response.status_code == 201
    assert create_response.data["data"]["alt_text"] == "Red canvas sneaker, side view"
    image_id = create_response.data["data"]["id"]

    detail_response = api_client.get(f"/api/v1/admin/catalog/images/{image_id}/")

    assert detail_response.status_code == 200
    assert detail_response.data["data"]["alt_text"] == "Red canvas sneaker, side view"

    update_response = api_client.patch(
        f"/api/v1/admin/catalog/images/{image_id}/",
        {"alt_text": "Red canvas sneaker, sole detail"},
    )

    assert update_response.status_code == 200
    assert update_response.data["data"]["alt_text"] == "Red canvas sneaker, sole detail"


def test_admin_product_image_alt_text_defaults_to_blank(api_client):
    admin = create_user(email="catalog-image-alt-blank@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    product = ProductFactory()

    response = api_client.post(
        f"/api/v1/admin/catalog/products/{product.id}/images/",
        {"url": "https://example.com/no-alt.jpg"},
    )

    assert response.status_code == 201
    assert response.data["data"]["alt_text"] == ""


def test_public_product_payload_includes_image_alt_text(api_client):
    product = ProductFactory()
    ProductVariantFactory(product=product, sku="ALT-1")
    ProductImageFactory(
        product=product, url="https://example.com/public.jpg", alt_text="Front of the product"
    )

    response = api_client.get(f"/api/v1/public/catalog/products/{product.slug}/")

    assert response.status_code == 200
    assert response.data["data"]["images"][0]["alt_text"] == "Front of the product"

    list_response = api_client.get("/api/v1/public/catalog/products/")

    assert list_response.status_code == 200
    listed = next(
        item for item in list_response.data["data"]["results"] if item["slug"] == product.slug
    )
    assert listed["images"][0]["alt_text"] == "Front of the product"


def test_customer_cannot_get_product_image_detail(api_client):
    customer = create_user(email="catalog-image-customer@example.com")
    api_client.force_authenticate(user=customer)
    image = ProductImageFactory()

    response = api_client.get(f"/api/v1/admin/catalog/images/{image.id}/")

    assert response.status_code == 403


def test_public_category_detail_by_slug(api_client):
    category = CategoryFactory(name="Gadgets", slug="gadgets")

    response = api_client.get("/api/v1/public/catalog/categories/gadgets/")

    assert response.status_code == 200
    assert response.data["data"]["slug"] == category.slug
    assert response.data["data"]["name"] == "Gadgets"


def test_public_category_detail_404_for_inactive_category(api_client):
    CategoryFactory(slug="hidden-category", is_active=False)

    response = api_client.get("/api/v1/public/catalog/categories/hidden-category/")

    assert response.status_code == 404
    assert response.data["error"]["code"] == "category_not_found"


def test_admin_bulk_product_status_change(api_client):
    admin = create_user(email="catalog-bulk-status-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    first = ProductFactory(is_active=True)
    second = ProductFactory(is_active=True)
    untouched = ProductFactory(is_active=True)

    response = api_client.post(
        "/api/v1/admin/catalog/products/bulk-status/",
        {"ids": [str(first.id), str(second.id)], "is_active": False},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["data"] == {"affected": 2}
    assert Product.objects.filter(is_active=False).count() == 2
    untouched.refresh_from_db()
    assert untouched.is_active is True


def test_bulk_product_status_requires_manage_permission(api_client):
    staff = create_user(email="catalog-bulk-status-viewer@example.com", role=UserRole.STAFF)
    admin = create_user(email="catalog-bulk-status-grantor@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.CATALOG_VIEW,
        is_enabled=True,
        granted_by=admin,
    )
    api_client.force_authenticate(user=staff)
    product = ProductFactory()

    response = api_client.post(
        "/api/v1/admin/catalog/products/bulk-status/",
        {"ids": [str(product.id)], "is_active": False},
        format="json",
    )

    assert response.status_code == 403


def test_admin_can_create_product_with_only_required_fields(api_client):
    admin = create_user(email="catalog-create-product@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    category = CategoryFactory()

    response = api_client.post(
        "/api/v1/admin/catalog/products/",
        {"category_id": str(category.id), "name": "Minimal Product"},
        format="json",
    )

    assert response.status_code == 201, response.data
    assert response.data["data"]["name"] == "Minimal Product"
    assert response.data["data"]["variants"] == []
    assert response.data["data"]["total_stock"] == 0


def test_public_product_exposes_variant_level_images(api_client):
    """The admin panel can attach an image to a variant instead of the product;
    the storefront reads one `images` list and would otherwise never see them."""
    product = ProductFactory()
    variant = ProductVariantFactory(product=product)
    ProductImageFactory(product=product, variant=None, url="https://cdn.test/product.jpg")
    ProductImageFactory(product=None, variant=variant, url="https://cdn.test/variant.jpg")

    response = api_client.get(f"/api/v1/public/catalog/products/{product.slug}/")

    assert response.status_code == 200
    urls = [image["url"] for image in response.data["data"]["images"]]
    assert urls == ["https://cdn.test/product.jpg", "https://cdn.test/variant.jpg"]


def test_public_product_detail_exposes_variant_colour_and_size(api_client):
    product = ProductFactory(product_type=Product.ProductType.VARIANT)
    ProductVariantFactory(product=product, sku="PANJABI-NAVY-L", color="Navy", size="L")
    ProductVariantFactory(product=product, sku="PANJABI-NAVY-XL", color="Navy", size="XL")

    response = api_client.get(f"/api/v1/public/catalog/products/{product.slug}/")

    assert response.status_code == 200
    variants = response.data["data"]["variants"]
    assert {(item["color"], item["size"]) for item in variants} == {("Navy", "L"), ("Navy", "XL")}


def test_public_variant_exposes_a_discount_below_the_price(api_client):
    product = ProductFactory()
    ProductVariantFactory(product=product, price="200.00", discount_price="150.00")

    response = api_client.get(f"/api/v1/public/catalog/products/{product.slug}/")

    assert response.data["data"]["variants"][0]["discount_price"] == "150.00"


def test_public_variant_suppresses_a_discount_at_or_above_the_price(api_client):
    product = ProductFactory()
    ProductVariantFactory(product=product, price="200.00", discount_price="200.00")

    response = api_client.get(f"/api/v1/public/catalog/products/{product.slug}/")

    assert response.data["data"]["variants"][0]["discount_price"] is None


def test_admin_rejects_a_discount_that_is_not_below_the_price(api_client):
    admin = create_user(email="catalog-discount-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    category = CategoryFactory()

    response = api_client.post(
        "/api/v1/admin/catalog/products/",
        {
            "category_id": str(category.id),
            "name": "Overpriced discount",
            "price": "100.00",
            "discount_price": "120.00",
        },
    )

    assert response.status_code == 400


def test_admin_category_defaults_to_stock_type(api_client):
    admin = create_user(email="catalog-category-type-default@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.post("/api/v1/admin/catalog/categories/", {"name": "Gadgets"})

    assert response.status_code == 201
    assert response.data["data"]["category_type"] == "stock"


def test_admin_can_create_root_preorder_category(api_client):
    admin = create_user(email="catalog-preorder-category-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.post(
        "/api/v1/admin/catalog/categories/",
        {"name": "Upcoming Releases", "category_type": "preorder"},
    )

    assert response.status_code == 201
    assert response.data["data"]["category_type"] == "preorder"


def test_subcategory_inherits_parent_category_type(api_client):
    admin = create_user(email="catalog-subcat-inherit-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    parent = CategoryFactory(name="Pre-order Root", category_type="preorder")

    response = api_client.post(
        "/api/v1/admin/catalog/categories/",
        {"name": "Pre-order Phones", "parent_id": str(parent.id)},
    )

    assert response.status_code == 201
    assert response.data["data"]["category_type"] == "preorder"


def test_subcategory_create_rejects_type_mismatch_with_parent(api_client):
    admin = create_user(email="catalog-subcat-mismatch-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    parent = CategoryFactory(name="Stock Root", category_type="stock")

    response = api_client.post(
        "/api/v1/admin/catalog/categories/",
        {
            "name": "Mismatched Subcategory",
            "parent_id": str(parent.id),
            "category_type": "preorder",
        },
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "category_type_mismatch"


def test_admin_cannot_change_subcategory_type_directly(api_client):
    admin = create_user(email="catalog-subcat-locked-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    parent = CategoryFactory(name="Stock Parent", category_type="stock")
    child = CategoryFactory(name="Stock Child", parent=parent, category_type="stock")

    response = api_client.patch(
        f"/api/v1/admin/catalog/categories/{child.id}/", {"category_type": "preorder"}
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "category_type_locked_to_parent"
    child.refresh_from_db()
    assert child.category_type == "stock"


def test_root_category_type_change_cascades_to_descendants(api_client):
    admin = create_user(email="catalog-cascade-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    root = CategoryFactory(name="Cascade Root", category_type="stock")
    child = CategoryFactory(name="Cascade Child", parent=root, category_type="stock")
    grandchild = CategoryFactory(name="Cascade Grandchild", parent=child, category_type="stock")

    response = api_client.patch(
        f"/api/v1/admin/catalog/categories/{root.id}/", {"category_type": "preorder"}
    )

    assert response.status_code == 200
    child.refresh_from_db()
    grandchild.refresh_from_db()
    assert child.category_type == "preorder"
    assert grandchild.category_type == "preorder"


def test_reparenting_category_adopts_new_parent_type_and_cascades(api_client):
    admin = create_user(email="catalog-reparent-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    stock_root = CategoryFactory(name="Stock Root Reparent", category_type="stock")
    preorder_root = CategoryFactory(name="Preorder Root Reparent", category_type="preorder")
    moved = CategoryFactory(name="Moved Category", parent=stock_root, category_type="stock")
    moved_child = CategoryFactory(name="Moved Child", parent=moved, category_type="stock")

    response = api_client.patch(
        f"/api/v1/admin/catalog/categories/{moved.id}/", {"parent_id": str(preorder_root.id)}
    )

    assert response.status_code == 200
    assert response.data["data"]["category_type"] == "preorder"
    moved_child.refresh_from_db()
    assert moved_child.category_type == "preorder"


def test_admin_category_list_filters_by_category_type(api_client):
    admin = create_user(email="catalog-type-filter-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    stock_category = CategoryFactory(name="Stock Filter Category", category_type="stock")
    preorder_category = CategoryFactory(name="Preorder Filter Category", category_type="preorder")

    response = api_client.get("/api/v1/admin/catalog/categories/?category_type=preorder")

    assert response.status_code == 200
    names = [item["name"] for item in response.data["data"]["results"]]
    assert preorder_category.name in names
    assert stock_category.name not in names


def test_admin_product_list_filters_by_category_type(api_client):
    admin = create_user(email="catalog-product-type-filter-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    stock_category = CategoryFactory(name="Stock Product Category", category_type="stock")
    preorder_category = CategoryFactory(
        name="Preorder Product Category", category_type="preorder"
    )
    stock_product = ProductFactory(name="Stock Category Product", category=stock_category)
    preorder_product = ProductFactory(
        name="Preorder Category Product", category=preorder_category
    )

    response = api_client.get("/api/v1/admin/catalog/products/?category_type=preorder")

    assert response.status_code == 200
    names = [item["name"] for item in response.data["data"]["results"]]
    assert preorder_product.name in names
    assert stock_product.name not in names


def test_public_category_list_filters_by_category_type(api_client):
    stock_category = CategoryFactory(name="Public Stock Category", category_type="stock")
    preorder_category = CategoryFactory(
        name="Public Preorder Category", category_type="preorder"
    )

    response = api_client.get("/api/v1/public/catalog/categories/?category_type=preorder")

    assert response.status_code == 200
    names = [item["name"] for item in response.data["data"]]
    assert preorder_category.name in names
    assert stock_category.name not in names


def test_public_product_list_filters_by_category_type(api_client):
    stock_category = CategoryFactory(name="Public Stock Product Category", category_type="stock")
    preorder_category = CategoryFactory(
        name="Public Preorder Product Category", category_type="preorder"
    )
    stock_product = ProductFactory(
        name="Public Stock Category Product", category=stock_category, is_active=True
    )
    ProductVariantFactory(product=stock_product)
    preorder_product = ProductFactory(
        name="Public Preorder Category Product", category=preorder_category, is_active=True
    )
    ProductVariantFactory(product=preorder_product)

    response = api_client.get("/api/v1/public/catalog/products/?category_type=preorder")

    assert response.status_code == 200
    names = [item["name"] for item in response.data["data"]["results"]]
    assert preorder_product.name in names
    assert stock_product.name not in names


def test_invalid_category_type_filter_is_rejected(api_client):
    admin = create_user(email="catalog-invalid-type-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.get("/api/v1/admin/catalog/categories/?category_type=bogus")

    assert response.status_code == 400
