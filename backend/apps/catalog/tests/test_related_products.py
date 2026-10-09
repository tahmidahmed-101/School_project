from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.catalog.factories import CategoryFactory, ProductFactory, ProductVariantFactory
from apps.catalog.models import Brand
from apps.catalog.selectors.sales import live_sales

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _live_sales_already_loaded(db):
    live_sales()

SIZES = ["S", "M", "L", "XL"]


def _url(product, **params) -> str:
    query = "&".join(f"{key}={value}" for key, value in params.items())
    return f"/api/v1/public/catalog/products/{product.slug}/related/" + (
        f"?{query}" if query else ""
    )


def _product(variants: int = 1, **kwargs):
    product = ProductFactory(**{"is_active": True, **kwargs})
    for index in range(variants):
        ProductVariantFactory(product=product, size=SIZES[index])
    return product


def _ids(response) -> list[str]:
    return [row["id"] for row in response.data["data"]]


def test_related_ranks_same_category_and_brand_first(api_client):
    category = CategoryFactory()
    brand = Brand.objects.create(name="Acme", slug="acme")
    current = _product(category=category, brand=brand)
    category_and_brand = _product(category=category, brand=brand, name="Zeta")
    category_only = _product(category=category, name="Alpha")
    brand_only = _product(brand=brand, name="Beta")
    featured_elsewhere = _product(featured=True, name="Gamma")
    _product(name="Unrelated")

    response = api_client.get(_url(current))

    assert response.status_code == 200
    assert _ids(response) == [
        str(category_and_brand.id),
        str(category_only.id),
        str(brand_only.id),
        str(featured_elsewhere.id),
    ]


def test_related_never_crosses_between_the_stock_and_preorder_shops(api_client):
    brand = Brand.objects.create(name="Acme", slug="acme")
    stock = CategoryFactory(category_type="stock")
    preorder = CategoryFactory(category_type="preorder")
    current = _product(category=preorder, brand=brand)
    same_shop = _product(category=preorder, name="Same shop")
    _product(category=stock, brand=brand, featured=True, name="Other shop")

    response = api_client.get(_url(current))

    assert _ids(response) == [str(same_shop.id)]
    assert response.data["data"][0]["kind"] == "preorder"


def test_related_excludes_self_and_unsellable_products(api_client):
    category = CategoryFactory()
    current = _product(category=category)
    inactive = _product(category=category, is_active=False)
    no_variants = ProductFactory(is_active=True, category=category)
    deleted_variant_only = ProductFactory(is_active=True, category=category)
    variant = ProductVariantFactory(product=deleted_variant_only)
    variant.soft_delete()
    disabled_variant_only = ProductFactory(is_active=True, category=category)
    ProductVariantFactory(product=disabled_variant_only, is_active=False)
    visible = _product(category=category)

    ids = _ids(api_client.get(_url(current)))

    assert ids == [str(visible.id)]
    for hidden in (current, inactive, no_variants, deleted_variant_only, disabled_variant_only):
        assert str(hidden.id) not in ids


def test_related_uses_the_public_list_shape_without_internal_fields(api_client):
    category = CategoryFactory()
    current = _product(category=category)
    _product(category=category)

    row = api_client.get(_url(current)).data["data"][0]
    variant = row["variants"][0]

    assert "description" not in row
    for internal in ("cost_price", "barcode", "stock", "available_quantity", "reorder_point"):
        assert internal not in variant
    assert isinstance(variant["in_stock"], bool)


def test_related_respects_limit(api_client):
    category = CategoryFactory()
    current = _product(category=category)
    for _ in range(5):
        _product(category=category)

    assert len(api_client.get(_url(current, limit=3)).data["data"]) == 3
    assert len(api_client.get(_url(current)).data["data"]) == 5


@pytest.mark.parametrize("limit", ["0", "25", "abc"])
def test_related_rejects_bad_limit(api_client, limit):
    current = _product()

    response = api_client.get(_url(current, limit=limit))

    assert response.status_code == 400
    assert "limit" in response.data["error"]["fields"]


def test_related_for_unknown_or_inactive_product_is_404(api_client):
    inactive = _product(is_active=False)

    assert api_client.get("/api/v1/public/catalog/products/nope/related/").status_code == 404
    assert api_client.get(_url(inactive)).status_code == 404


def test_related_query_count_does_not_grow_with_results(api_client):
    category = CategoryFactory()
    current = _product(category=category)
    _product(category=category, variants=2)
    with CaptureQueriesContext(connection) as small:
        assert api_client.get(_url(current)).status_code == 200

    for _ in range(5):
        _product(category=category, variants=3)
    with CaptureQueriesContext(connection) as large:
        assert api_client.get(_url(current)).status_code == 200

    assert len(large) == len(small)
