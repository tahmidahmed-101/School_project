"""A pre-order variant's minimum quantity: how it is set, read and kept off
stock rows. Checkout's enforcement lives in apps/orders/tests."""

from __future__ import annotations

import csv
from decimal import Decimal
from io import BytesIO, StringIO

import pytest

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductVariantFactory
from apps.catalog.models import ProductVariant
from apps.catalog.services.products import create_variant, update_variant
from apps.catalog.services.variant_import_export import (
    PREORDER_EXPORT_COLUMNS,
    export_variants,
    import_variants,
)

from .test_kind_rules import PREORDER, STOCK, _product, _refused, _window

pytestmark = pytest.mark.django_db

BASE = "/api/v1/admin/catalog/"


@pytest.fixture
def admin_client(api_client):
    api_client.force_authenticate(
        user=create_user(email="preorder-min-admin@example.com", role=UserRole.ADMIN)
    )
    return api_client


def _preorder_payload(**fields) -> dict:
    window = _window()
    return {
        "price": "100.00",
        "is_preorder_enabled": True,
        "preorder_start_date": window["preorder_start_date"].isoformat(),
        "preorder_end_date": window["preorder_end_date"].isoformat(),
        **fields,
    }


def test_defaults_to_one():
    variant = create_variant(
        product=_product(PREORDER), price=Decimal("100.00"), is_preorder_enabled=True, **_window()
    )

    assert variant.preorder_min_quantity == 1
    assert ProductVariantFactory(product=_product(STOCK)).preorder_min_quantity == 1


def test_admin_creates_reads_and_updates_the_minimum(admin_client):
    product = _product(PREORDER)

    response = admin_client.post(
        f"{BASE}products/{product.id}/variants/",
        _preorder_payload(preorder_min_quantity=5, preorder_stock_limit=50),
        format="json",
    )
    assert response.status_code == 201, response.data
    assert response.data["data"]["preorder_min_quantity"] == 5
    assert response.data["data"]["preorder_stock_limit"] == 50
    variant_id = response.data["data"]["id"]

    response = admin_client.patch(
        f"{BASE}variants/{variant_id}/", {"preorder_min_quantity": 3}, format="json"
    )
    assert response.status_code == 200, response.data
    assert response.data["data"]["preorder_min_quantity"] == 3
    assert ProductVariant.objects.get(id=variant_id).preorder_min_quantity == 3

    detail = admin_client.get(f"{BASE}variants/{variant_id}/")
    listed = admin_client.get(f"{BASE}products/{product.id}/variants/")
    assert detail.data["data"]["preorder_min_quantity"] == 3
    assert listed.data["data"]["results"][0]["preorder_min_quantity"] == 3


def test_admin_create_without_the_minimum_stores_one(admin_client):
    product = _product(PREORDER)

    response = admin_client.post(
        f"{BASE}products/{product.id}/variants/", _preorder_payload(), format="json"
    )

    assert response.status_code == 201, response.data
    assert response.data["data"]["preorder_min_quantity"] == 1


@pytest.mark.parametrize("value", [0, -2])
def test_admin_refuses_a_minimum_below_one(admin_client, value):
    product = _product(PREORDER)
    variant = create_variant(
        product=product, price=Decimal("100.00"), is_preorder_enabled=True, **_window()
    )

    created = admin_client.post(
        f"{BASE}products/{product.id}/variants/",
        _preorder_payload(preorder_min_quantity=value),
        format="json",
    )
    patched = admin_client.patch(
        f"{BASE}variants/{variant.id}/", {"preorder_min_quantity": value}, format="json"
    )

    assert created.status_code == 400
    assert patched.status_code == 400
    variant.refresh_from_db()
    assert variant.preorder_min_quantity == 1


def test_service_refuses_a_minimum_below_one():
    product = _product(PREORDER)
    _refused(
        "invalid_preorder_min_quantity",
        create_variant,
        product=product,
        price=Decimal("100.00"),
        is_preorder_enabled=True,
        preorder_min_quantity=0,
        **_window(),
    )
    variant = create_variant(
        product=product, price=Decimal("100.00"), is_preorder_enabled=True, **_window()
    )
    _refused(
        "invalid_preorder_min_quantity",
        update_variant,
        variant=variant,
        data={"preorder_min_quantity": 0},
    )


def test_a_stock_variant_cannot_carry_a_minimum_but_keeps_the_default():
    product = _product(STOCK)
    _refused(
        "preorder_category_required",
        create_variant,
        product=product,
        price=Decimal("100.00"),
        preorder_min_quantity=3,
    )
    variant = create_variant(product=product, price=Decimal("100.00"), preorder_min_quantity=1)
    _refused(
        "preorder_category_required",
        update_variant,
        variant=variant,
        data={"preorder_min_quantity": 2},
    )


def test_a_stock_variant_row_reports_no_minimum(admin_client):
    variant = ProductVariantFactory(product=_product(STOCK))

    response = admin_client.get(f"{BASE}variants/{variant.id}/")

    assert response.data["data"]["preorder_min_quantity"] is None


def test_public_catalog_exposes_the_minimum_for_preorder_only(api_client):
    preorder = ProductVariantFactory(
        product=_product(PREORDER), is_preorder_enabled=True, preorder_min_quantity=4, **_window()
    )
    stock = ProductVariantFactory(product=_product(STOCK))

    rows = {}
    for variant in (preorder, stock):
        response = api_client.get(f"/api/v1/public/catalog/products/{variant.product.slug}/")
        assert response.status_code == 200, response.data
        rows[variant.id] = response.data["data"]["variants"][0]

    assert rows[preorder.id]["preorder_min_quantity"] == 4
    assert rows[stock.id]["preorder_min_quantity"] is None


def test_preorder_export_carries_the_minimum():
    variant = ProductVariantFactory(
        product=_product(PREORDER), is_preorder_enabled=True, preorder_min_quantity=6, **_window()
    )

    content = export_variants(ProductVariant.objects.all(), fmt="csv", kind=PREORDER)

    header, row = list(csv.reader(StringIO(content.decode("utf-8-sig"))))
    assert header == PREORDER_EXPORT_COLUMNS
    assert dict(zip(header, row, strict=True))["preorder_min_quantity"] == "6"
    assert row[1] == variant.sku


def _import(rows: list[dict]):
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    return import_variants(file=BytesIO(buffer.getvalue().encode("utf-8")), fmt="csv")


def test_stock_import_refuses_a_minimum_but_accepts_the_default():
    product = _product(STOCK)
    base = {"product_name": product.name, "price": "50.00"}

    result = _import(
        [
            {**base, "sku": "MIN-DEFAULT", "preorder_min_quantity": "1"},
            {**base, "sku": "MIN-SET", "preorder_min_quantity": "4"},
        ]
    )

    assert result.created == 1
    assert [error["sku"] for error in result.errors] == ["MIN-SET"]
    assert "preorder_min_quantity" in result.errors[0]["message"]
