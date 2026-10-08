from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductFactory, ProductVariantFactory
from apps.inventory.factories import StockItemFactory

pytestmark = pytest.mark.django_db


def _seed_low_stock(count: int) -> None:
    for index in range(count):
        product = ProductFactory(name=f"Widget {index}")
        variant = ProductVariantFactory(product=product)
        StockItemFactory(variant=variant, quantity_on_hand=1, reorder_point=10)


def test_customer_cannot_access_reporting(api_client):
    customer = create_user(email="report-customer@example.com")
    api_client.force_authenticate(user=customer)

    response = api_client.get(
        "/api/v1/admin/reporting/sales-trend/", {"start": "2026-01-01", "end": "2026-12-31"}
    )

    assert response.status_code == 403


def test_admin_can_fetch_low_stock_summary(api_client):
    admin = create_user(email="report-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.get("/api/v1/admin/reporting/low-stock/")

    assert response.status_code == 200
    assert response.data["data"] == []


def test_low_stock_count_only_returns_the_count_without_rows(api_client):
    admin = create_user(email="report-count-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    _seed_low_stock(3)

    counted = api_client.get("/api/v1/admin/reporting/low-stock/", {"count_only": "1"})
    listed = api_client.get("/api/v1/admin/reporting/low-stock/")

    assert counted.status_code == 200
    assert counted.data == {"data": {"count": 3}, "message": "Success"}
    assert len(listed.data["data"]) == 3
    assert listed.data["data"][0]["variant_sku"]


def test_low_stock_summary_exposes_human_labels_alongside_ids(api_client):
    admin = create_user(email="report-labels-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    product = ProductFactory(name="Noise Cancelling Headphones")
    variant = ProductVariantFactory(product=product, sku="SKU-LABEL")
    StockItemFactory(variant=variant, quantity_on_hand=1, reorder_point=10)

    response = api_client.get("/api/v1/admin/reporting/low-stock/")

    assert response.status_code == 200
    row = response.data["data"][0]
    assert row["variant_sku"] == "SKU-LABEL"
    assert row["product_name"] == "Noise Cancelling Headphones"
    assert str(row["variant_id"]) == str(variant.id)


def test_low_stock_summary_query_count_does_not_grow_with_row_count(api_client):
    admin = create_user(email="report-nplusone-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    _seed_low_stock(2)
    with CaptureQueriesContext(connection) as small:
        assert len(api_client.get("/api/v1/admin/reporting/low-stock/").data["data"]) == 2

    _seed_low_stock(4)
    with CaptureQueriesContext(connection) as large:
        assert len(api_client.get("/api/v1/admin/reporting/low-stock/").data["data"]) == 6

    assert len(large.captured_queries) == len(small.captured_queries)
