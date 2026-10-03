from __future__ import annotations

from decimal import Decimal

import pytest

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import CategoryFactory, ProductVariantFactory
from apps.catalog.models import Product
from apps.catalog.selectors.bundles import bundle_available_quantities, bundle_variants_list
from apps.catalog.services.bundles import (
    create_bundle,
    delete_bundle,
    update_bundle,
)
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement

pytestmark = pytest.mark.django_db


def _component_variant(price: str, stock: int = 10, cost: str = "0"):
    variant = ProductVariantFactory(price=Decimal(price), cost_price=Decimal(cost))
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=stock,
        unit_cost=Decimal("1.00"),
    )
    return variant


def test_create_bundle_explicit_price_is_kept():
    a = _component_variant("10.00")
    category = CategoryFactory()

    variant = create_bundle(
        category=category,
        name="Duo Bundle",
        sku="BND-001",
        price=Decimal("15.00"),
        components=[{"component_variant_id": str(a.id), "quantity": 1}],
        actor=None,
    )

    assert variant.product.product_type == Product.ProductType.BUNDLE
    assert variant.price == Decimal("15.00")
    assert variant.bundle_components.count() == 1
    assert variant.bundle_components.get().component_variant_id == a.id


def test_create_bundle_defaults_price_and_cost_from_components():
    a = _component_variant("10.00", cost="6.00")
    b = _component_variant("5.00", cost="3.00")
    category = CategoryFactory()

    variant = create_bundle(
        category=category,
        name="Auto Bundle",
        sku="BND-002",
        components=[
            {"component_variant_id": str(a.id), "quantity": 2},
            {"component_variant_id": str(b.id), "quantity": 1},
        ],
        actor=None,
    )

    assert variant.price == Decimal("25.00")
    assert variant.cost_price == Decimal("15.00")


def test_create_bundle_rejects_empty_components():
    category = CategoryFactory()

    with pytest.raises(BusinessRuleViolationError):
        create_bundle(
            category=category,
            name="No Components Bundle",
            sku="BND-003",
            components=[],
            actor=None,
        )


def test_create_bundle_rejects_discount_at_or_above_price():
    a = _component_variant("10.00")
    category = CategoryFactory()

    with pytest.raises(BusinessRuleViolationError):
        create_bundle(
            category=category,
            name="Bad Discount",
            sku="BND-BAD",
            price=Decimal("10.00"),
            discount_price=Decimal("12.00"),
            components=[{"component_variant_id": str(a.id), "quantity": 1}],
            actor=None,
        )


def test_bundle_discount_price_drives_effective_price():
    a = _component_variant("10.00")
    category = CategoryFactory()

    variant = create_bundle(
        category=category,
        name="Discounted Duo",
        sku="BND-DISC",
        price=Decimal("16.00"),
        discount_price=Decimal("14.40"),
        components=[{"component_variant_id": str(a.id), "quantity": 1}],
        actor=None,
    )

    assert variant.discount_price == Decimal("14.40")
    assert variant.effective_price == Decimal("14.40")


def test_create_bundle_rejects_circular_dependency():
    a = _component_variant("10.00")
    category = CategoryFactory()
    bundle = create_bundle(
        category=category,
        name="Outer",
        sku="BND-OUT",
        price=Decimal("20.00"),
        components=[{"component_variant_id": str(a.id), "quantity": 1}],
        actor=None,
    )

    with pytest.raises(BusinessRuleViolationError):
        update_bundle(
            bundle_variant=bundle,
            data={},
            components=[{"component_variant_id": str(bundle.id), "quantity": 1}],
            actor=None,
        )


def test_update_bundle_rederives_price_from_new_components():
    a = _component_variant("10.00", cost="4.00")
    category = CategoryFactory()
    bundle = create_bundle(
        category=category,
        name="Recalc",
        sku="BND-REC",
        components=[{"component_variant_id": str(a.id), "quantity": 1}],
        actor=None,
    )
    assert bundle.price == Decimal("10.00")

    b = _component_variant("5.00", cost="2.00")
    update_bundle(
        bundle_variant=bundle,
        data={},
        components=[
            {"component_variant_id": str(a.id), "quantity": 1},
            {"component_variant_id": str(b.id), "quantity": 1},
        ],
        actor=None,
    )

    bundle.refresh_from_db()
    assert bundle.price == Decimal("15.00")
    assert bundle.cost_price == Decimal("6.00")


def test_update_bundle_keeps_explicit_price_over_derived():
    a = _component_variant("10.00")
    category = CategoryFactory()
    bundle = create_bundle(
        category=category,
        name="Override",
        sku="BND-OVR",
        components=[{"component_variant_id": str(a.id), "quantity": 1}],
        actor=None,
    )

    b = _component_variant("5.00")
    update_bundle(
        bundle_variant=bundle,
        data={"price": Decimal("99.00")},
        components=[
            {"component_variant_id": str(a.id), "quantity": 1},
            {"component_variant_id": str(b.id), "quantity": 1},
        ],
        actor=None,
    )

    bundle.refresh_from_db()
    assert bundle.price == Decimal("99.00")


def test_delete_bundle_soft_deletes_variant():
    a = _component_variant("10.00")
    category = CategoryFactory()
    bundle = create_bundle(
        category=category,
        name="To Delete",
        sku="BND-DEL-2",
        price=Decimal("15.00"),
        components=[{"component_variant_id": str(a.id), "quantity": 1}],
        actor=None,
    )

    delete_bundle(bundle_variant=bundle)

    bundle.refresh_from_db()
    assert bundle.deleted_at is not None


def test_bundle_available_quantity_is_min_over_components():
    a = _component_variant("10.00", stock=6)
    b = _component_variant("5.00", stock=3)
    category = CategoryFactory()
    bundle = create_bundle(
        category=category,
        name="Stocked",
        sku="BND-STK",
        price=Decimal("15.00"),
        components=[
            {"component_variant_id": str(a.id), "quantity": 2},
            {"component_variant_id": str(b.id), "quantity": 1},
        ],
        actor=None,
    )

    available = bundle_available_quantities([bundle.id])
    assert available[bundle.id] == 3


def test_bundle_variants_list_returns_only_bundles():
    a = _component_variant("10.00")
    category = CategoryFactory()
    create_bundle(
        category=category,
        name="Only Bundle",
        sku="BND-LST",
        price=Decimal("15.00"),
        components=[{"component_variant_id": str(a.id), "quantity": 1}],
        actor=None,
    )
    ProductVariantFactory()

    skus = {v.sku for v in bundle_variants_list()}
    assert skus == {"BND-LST"}


def test_bundle_admin_api_permissions(api_client):
    customer = create_user(email="bundle-customer@example.com")
    api_client.force_authenticate(user=customer)

    response = api_client.get("/api/v1/admin/catalog/bundles/")

    assert response.status_code == 403


def test_bundle_admin_api_create_and_list(api_client):
    admin = create_user(email="bundle-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    a = _component_variant("10.00")
    category = CategoryFactory()

    create_response = api_client.post(
        "/api/v1/admin/catalog/bundles/",
        {
            "category_id": str(category.id),
            "name": "API Bundle",
            "sku": "BND-API",
            "price": "15.00",
            "components": [{"component_variant_id": str(a.id), "quantity": 1}],
        },
        format="json",
    )

    assert create_response.status_code == 201
    assert create_response.data["data"]["sku"] == "BND-API"
    assert create_response.data["data"]["components"][0]["component_variant_id"] == str(a.id)

    list_response = api_client.get("/api/v1/admin/catalog/bundles/")
    assert list_response.status_code == 200
    assert list_response.data["data"]["count"] >= 1

    detail_response = api_client.get(
        f"/api/v1/admin/catalog/bundles/{create_response.data['data']['id']}/"
    )
    assert detail_response.status_code == 200
    assert detail_response.data["data"]["name"] == "API Bundle"

    delete_response = api_client.delete(
        f"/api/v1/admin/catalog/bundles/{create_response.data['data']['id']}/"
    )
    assert delete_response.status_code == 200


def test_bundle_admin_api_defaults_price_from_components(api_client):
    admin = create_user(email="bundle-auto-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    a = _component_variant("10.00", cost="4.00")
    b = _component_variant("6.00", cost="2.00")
    category = CategoryFactory()

    response = api_client.post(
        "/api/v1/admin/catalog/bundles/",
        {
            "category_id": str(category.id),
            "name": "Auto API Bundle",
            "sku": "BND-AUTO",
            "discount_price": "14.40",
            "components": [
                {"component_variant_id": str(a.id), "quantity": 1},
                {"component_variant_id": str(b.id), "quantity": 1},
            ],
        },
        format="json",
    )

    assert response.status_code == 201
    data = response.data["data"]
    assert data["price"] == "16.00"
    assert data["cost_price"] == "6.00"
    assert Decimal(str(data["effective_price"])) == Decimal("14.40")


def test_bundle_admin_api_create_honours_is_active(api_client):
    admin = create_user(email="bundle-inactive-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    component = _component_variant("10.00")
    category = CategoryFactory()

    response = api_client.post(
        "/api/v1/admin/catalog/bundles/",
        {
            "category_id": str(category.id),
            "name": "Draft Bundle",
            "sku": "BND-DRAFT",
            "price": "15.00",
            "is_active": False,
            "components": [{"component_variant_id": str(component.id), "quantity": 1}],
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.data["data"]["is_active"] is False


def test_create_bundle_auto_generates_sku_when_blank():
    a = _component_variant("10.00")
    variant = create_bundle(
        category=CategoryFactory(),
        name="No SKU Combo",
        components=[{"component_variant_id": str(a.id), "quantity": 1}],
        actor=None,
    )
    assert variant.sku == variant.product.slug.upper()
