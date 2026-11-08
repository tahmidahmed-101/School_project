"""The admin product endpoints batch stock and reorder points for the whole
page. These lock in the batched behaviour, so the list does not grow by one
query per variant."""

from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.catalog.factories import ProductFactory, make_options, make_variant
from apps.catalog.selectors.sales import live_sales

pytestmark = pytest.mark.django_db

SIZES = ["S", "M", "L", "XL", "XXL", "3XL"]


@pytest.fixture(autouse=True)
def _live_sales_already_loaded():
    live_sales()


def _product(variants: int):
    product = ProductFactory(is_active=True)
    sizes = make_options(product, {"Size": SIZES[:variants]})
    for index in range(variants):
        make_variant(product, [sizes[SIZES[index]]])
    return product


def test_admin_product_list_query_count_does_not_grow_with_the_catalog(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    for _ in range(2):
        _product(variants=2)
    with CaptureQueriesContext(connection) as small:
        assert api_client.get("/api/v1/admin/catalog/products/").status_code == 200

    for _ in range(6):
        _product(variants=4)
    with CaptureQueriesContext(connection) as large:
        assert api_client.get("/api/v1/admin/catalog/products/").status_code == 200

    assert len(large) == len(small)


def test_admin_product_detail_query_count_does_not_grow_with_variants(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    few = _product(variants=1)
    many = _product(variants=6)

    with CaptureQueriesContext(connection) as single:
        assert api_client.get(f"/api/v1/admin/catalog/products/{few.id}/").status_code == 200
    with CaptureQueriesContext(connection) as multiple:
        assert api_client.get(f"/api/v1/admin/catalog/products/{many.id}/").status_code == 200

    assert len(multiple) == len(single)
