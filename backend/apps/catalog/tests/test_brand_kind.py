from __future__ import annotations

import pytest

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import CategoryFactory, ProductFactory
from apps.catalog.models import Brand, Category
from apps.catalog.selectors.brands import get_brand_by_slug
from apps.catalog.services.brands import create_brand, update_brand
from apps.catalog.services.products import create_product, update_product
from apps.common.exceptions import BusinessRuleViolationError

pytestmark = pytest.mark.django_db

BASE = "/api/v1/admin/catalog/"
STOCK = Category.CategoryType.STOCK
PREORDER = Category.CategoryType.PREORDER


@pytest.fixture
def admin_client(api_client):
    api_client.force_authenticate(
        user=create_user(email="brand-kind-admin@example.com", role=UserRole.ADMIN)
    )
    return api_client


def _refused(code, call, **kwargs):
    with pytest.raises(BusinessRuleViolationError) as excinfo:
        call(**kwargs)
    assert excinfo.value.code == code


def test_the_same_brand_name_is_allowed_once_per_kind_with_its_own_slug():
    stock = create_brand(name="Aarong")
    preorder = create_brand(name="Aarong", kind=PREORDER)

    assert (stock.kind, preorder.kind) == (STOCK, PREORDER)
    assert stock.slug != preorder.slug
    assert get_brand_by_slug(stock.slug) == stock
    assert get_brand_by_slug(preorder.slug) == preorder
    _refused("brand_name_taken", create_brand, name="Aarong", kind=PREORDER)
    _refused("brand_name_taken", update_brand, brand=preorder, data={"kind": STOCK})


@pytest.mark.parametrize("kind", [STOCK, PREORDER])
def test_a_product_takes_a_brand_of_its_own_kind(kind):
    other = PREORDER if kind == STOCK else STOCK
    category = CategoryFactory(category_type=kind)
    own = create_brand(name="Own", kind=kind)
    foreign = create_brand(name="Foreign", kind=other)

    _refused("brand_kind_mismatch", create_product, category=category, name="A", brand=foreign)
    product = create_product(category=category, name="A", brand=own)
    _refused("brand_kind_mismatch", update_product, product=product, data={"brand": foreign})
    assert update_product(product=product, data={"brand": None}).brand is None


def test_a_product_cannot_take_its_brand_into_a_category_of_the_other_kind():
    brand = create_brand(name="Stays")
    product = create_product(
        category=CategoryFactory(category_type=STOCK), name="Mover", brand=brand
    )
    preorder_category = CategoryFactory(category_type=PREORDER)

    _refused(
        "brand_kind_mismatch", update_product, product=product, data={"category": preorder_category}
    )
    update_product(product=product, data={"category": preorder_category, "brand": None})


def test_a_brand_in_use_keeps_its_kind():
    unused = create_brand(name="Unused")
    assert update_brand(brand=unused, data={"kind": PREORDER}).kind == PREORDER

    used = create_brand(name="Used")
    ProductFactory(category__category_type=STOCK, brand=used)
    _refused("brand_kind_in_use", update_brand, brand=used, data={"kind": PREORDER})
    update_brand(brand=used, data={"kind": STOCK, "description": "Same kind is fine"})


def test_brand_list_and_create_follow_kind(admin_client):
    stock = create_brand(name="Shared name")

    created = admin_client.post(f"{BASE}brands/", {"name": "Shared name", "kind": PREORDER})
    assert created.status_code == 201
    preorder_id = created.data["data"]["id"]
    assert created.data["data"]["kind"] == PREORDER
    assert admin_client.post(f"{BASE}brands/", {"name": "Plain"}).data["data"]["kind"] == STOCK

    rows = admin_client.get(f"{BASE}brands/?kind={PREORDER}").data["data"]["results"]
    assert [row["id"] for row in rows] == [preorder_id]
    rows = admin_client.get(f"{BASE}brands/?kind={STOCK}").data["data"]["results"]
    assert str(stock.id) in [row["id"] for row in rows]
    assert {row["kind"] for row in rows} == {STOCK}
    assert admin_client.get(f"{BASE}brands/?kind=x").status_code == 400

    admin_client.delete(f"{BASE}brands/{preorder_id}/")
    deleted = admin_client.get(f"{BASE}brands/?include_deleted=true&kind={STOCK}")
    assert preorder_id not in [row["id"] for row in deleted.data["data"]["results"]]
    restored = admin_client.post(f"{BASE}brands/{preorder_id}/restore/")
    assert restored.data["data"]["kind"] == PREORDER


def test_product_api_refuses_a_brand_of_the_other_kind(admin_client):
    category = CategoryFactory(category_type=PREORDER)
    stock_brand = Brand.objects.create(name="Stock brand", slug="stock-brand")

    response = admin_client.post(
        f"{BASE}products/",
        {"category_id": str(category.id), "name": "Imported", "brand_id": str(stock_brand.id)},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "brand_kind_mismatch"
