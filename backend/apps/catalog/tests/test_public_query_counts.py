"""The storefront list and detail endpoints are the highest-traffic reads in
the project, and both used to issue a stock query per variant. These lock in
the batched behaviour so a future serializer change cannot quietly restore it.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.catalog.factories import (
    CategoryFactory,
    ProductFactory,
    ProductVariantFactory,
    make_options,
    make_variant,
)
from apps.catalog.models import Category
from apps.catalog.selectors.sales import live_sales

pytestmark = pytest.mark.django_db

SIZES = ["S", "M", "L", "XL", "XXL", "3XL"]


@pytest.fixture(autouse=True)
def _live_sales_already_loaded():
    """The sale list is read from the database once a minute, not per request,
    so these counts are taken with it already in the cache."""
    live_sales()


def _catalog(products: int, variants_per_product: int) -> None:
    for _ in range(products):
        product = ProductFactory(is_active=True)
        sizes = make_options(product, {"Size": SIZES[:variants_per_product]})
        for index in range(variants_per_product):
            make_variant(product, [sizes[SIZES[index]]])


def _preorder_catalog(products: int, variants_per_product: int) -> None:
    now = timezone.now()
    for _ in range(products):
        product = ProductFactory(is_active=True)
        sizes = make_options(product, {"Size": SIZES[:variants_per_product]})
        for index in range(variants_per_product):
            make_variant(
                product,
                [sizes[SIZES[index]]],
                is_preorder_enabled=True,
                preorder_start_date=now - timedelta(days=1),
                preorder_end_date=now + timedelta(days=10),
                preorder_stock_limit=5,
            )


def test_product_list_query_count_does_not_grow_with_the_catalog(api_client):
    _catalog(products=2, variants_per_product=2)
    with CaptureQueriesContext(connection) as small:
        assert api_client.get("/api/v1/public/catalog/products/").status_code == 200

    _catalog(products=6, variants_per_product=3)
    with CaptureQueriesContext(connection) as large:
        assert api_client.get("/api/v1/public/catalog/products/").status_code == 200

    assert len(large) == len(small)


def test_product_list_prices_a_running_sale_without_a_query_per_variant(api_client):
    from decimal import Decimal

    from apps.catalog.services.sales import create_sale

    _catalog(products=2, variants_per_product=2)
    with CaptureQueriesContext(connection) as no_sale:
        assert api_client.get("/api/v1/public/catalog/products/").status_code == 200

    create_sale(
        name="Storewide",
        percent_off=Decimal("10.00"),
        starts_at=timezone.now() - timedelta(days=1),
    )
    with CaptureQueriesContext(connection) as reload:
        response = api_client.get("/api/v1/public/catalog/products/")
    assert response.data["data"]["results"][0]["sale"]["name"] == "Storewide"

    _catalog(products=6, variants_per_product=3)
    with CaptureQueriesContext(connection) as large:
        response = api_client.get("/api/v1/public/catalog/products/")
    assert len(response.data["data"]["results"]) == 8

    assert len(large) == len(no_sale)
    assert len(reload) - len(no_sale) <= 4


def test_product_list_query_count_does_not_grow_with_preorder_variants(api_client):
    """Pre-order capacity (preorder_stock_limit/preordered_quantity/
    preorder_remaining) is resolved via the same batched
    get_preordered_quantities() call as stock availability — one query for
    the page, not one per pre-order variant."""
    _preorder_catalog(products=2, variants_per_product=2)
    with CaptureQueriesContext(connection) as small:
        assert api_client.get("/api/v1/public/catalog/products/").status_code == 200

    _preorder_catalog(products=6, variants_per_product=3)
    with CaptureQueriesContext(connection) as large:
        assert api_client.get("/api/v1/public/catalog/products/").status_code == 200

    assert len(large) == len(small)


def test_product_detail_query_count_does_not_grow_with_variants(api_client):
    # Both have an option: a product without one skips the option-values query.
    one = ProductFactory(is_active=True)
    make_variant(one, [make_options(one, {"Size": ["S"]})["S"]])
    with CaptureQueriesContext(connection) as single:
        assert api_client.get(f"/api/v1/public/catalog/products/{one.slug}/").status_code == 200

    many = ProductFactory(is_active=True)
    sizes = make_options(many, {"Size": SIZES})
    for index in range(6):
        make_variant(many, [sizes[SIZES[index]]])
    with CaptureQueriesContext(connection) as multiple:
        assert api_client.get(f"/api/v1/public/catalog/products/{many.slug}/").status_code == 200

    assert len(multiple) == len(single)


def test_list_endpoint_counts_the_page_once(api_client):
    _catalog(products=3, variants_per_product=1)

    with CaptureQueriesContext(connection) as queries:
        assert api_client.get("/api/v1/public/catalog/products/").status_code == 200

    counts = [q["sql"] for q in queries.captured_queries if "COUNT(" in q["sql"].upper()]
    assert len(counts) == 1


def test_category_list_query_count_is_unaffected_by_category_type_filter(api_client):
    for _ in range(5):
        CategoryFactory(category_type=Category.CategoryType.STOCK)
    for _ in range(5):
        CategoryFactory(category_type=Category.CategoryType.PREORDER)

    with CaptureQueriesContext(connection) as unfiltered:
        assert api_client.get("/api/v1/public/catalog/categories/").status_code == 200
    with CaptureQueriesContext(connection) as filtered:
        response = api_client.get("/api/v1/public/catalog/categories/?category_type=preorder")
        assert response.status_code == 200

    assert len(filtered) == len(unfiltered)


def test_product_list_query_count_is_unaffected_by_category_type_filter(api_client):
    stock_category = CategoryFactory(category_type=Category.CategoryType.STOCK)
    preorder_category = CategoryFactory(category_type=Category.CategoryType.PREORDER)
    for _ in range(3):
        product = ProductFactory(is_active=True, category=stock_category)
        ProductVariantFactory(product=product)
    for _ in range(3):
        product = ProductFactory(is_active=True, category=preorder_category)
        ProductVariantFactory(product=product)

    with CaptureQueriesContext(connection) as unfiltered:
        assert api_client.get("/api/v1/public/catalog/products/").status_code == 200
    with CaptureQueriesContext(connection) as filtered:
        response = api_client.get("/api/v1/public/catalog/products/?category_type=preorder")
        assert response.status_code == 200

    assert len(filtered) == len(unfiltered)


def test_category_list_carries_product_count_and_image_in_constant_queries(api_client):
    from apps.catalog.models import ProductImage

    category = CategoryFactory()
    empty = CategoryFactory()

    def add_product(name: str, image_url: str | None, *, sellable: bool = True) -> None:
        product = ProductFactory(category=category, name=name)
        if sellable:
            ProductVariantFactory(product=product)
        if image_url:
            ProductImage.objects.create(product=product, url=image_url)

    add_product("Bravo", "https://img.test/bravo.jpg")
    add_product("Alpha", None)
    add_product("Hidden", "https://img.test/hidden.jpg", sellable=False)

    with CaptureQueriesContext(connection) as few:
        response = api_client.get("/api/v1/public/catalog/categories/")
    rows = {row["id"]: row for row in response.json()["data"]}

    assert rows[str(category.id)]["product_count"] == 2
    assert rows[str(category.id)]["image"] == "https://img.test/bravo.jpg"
    assert rows[str(empty.id)]["product_count"] == 0
    assert rows[str(empty.id)]["image"] is None

    for index in range(4):
        add_product(f"Extra {index}", f"https://img.test/extra-{index}.jpg")
    with CaptureQueriesContext(connection) as many:
        api_client.get("/api/v1/public/catalog/categories/")

    assert len(many) == len(few)


def test_category_list_prefers_the_picture_uploaded_on_the_category(api_client):
    from apps.catalog.models import ProductImage

    with_product = CategoryFactory()
    empty = CategoryFactory()
    product = ProductFactory(category=with_product)
    ProductVariantFactory(product=product)
    ProductImage.objects.create(product=product, url="https://img.test/product.jpg")
    # Only the stored path matters here, so no file is written.
    Category.objects.filter(id=with_product.id).update(image="categories/own.jpg")
    Category.objects.filter(id=empty.id).update(image="categories/empty.jpg")

    response = api_client.get("/api/v1/public/catalog/categories/")
    rows = {row["id"]: row for row in response.json()["data"]}

    assert rows[str(with_product.id)]["image"] == "/media/categories/own.jpg"
    assert rows[str(empty.id)]["image"] == "/media/categories/empty.jpg"
