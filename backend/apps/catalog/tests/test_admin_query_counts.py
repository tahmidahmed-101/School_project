"""The admin product endpoints batched stock and reorder points but resolved
each variant's pre-ordered quantity with its own query, so the list grew by one
query per variant. These lock in the batched behaviour."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.catalog.factories import ProductFactory, ProductVariantFactory
from apps.catalog.selectors.sales import live_sales

pytestmark = pytest.mark.django_db

SIZES = ["S", "M", "L", "XL", "XXL", "3XL"]


@pytest.fixture(autouse=True)
def _live_sales_already_loaded():
    live_sales()


def _product(variants: int):
    now = timezone.now()
    product = ProductFactory(is_active=True)
    for index in range(variants):
        ProductVariantFactory(
            product=product,
            size=SIZES[index],
            is_preorder_enabled=True,
            preorder_start_date=now - timedelta(days=1),
            preorder_end_date=now + timedelta(days=10),
            preorder_stock_limit=5,
        )
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
