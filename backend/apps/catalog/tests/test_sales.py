from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.catalog.factories import CategoryFactory, ProductFactory, ProductVariantFactory
from apps.catalog.models import Brand, ProductVariant, Sale
from apps.catalog.services.sales import create_sale, delete_sale, update_sale
from apps.common.exceptions import BusinessRuleViolationError

pytestmark = pytest.mark.django_db

SALES_URL = "/api/v1/admin/sales/"
PRODUCTS_URL = "/api/v1/public/catalog/products/"


def _sale(percent="20.00", *, starts_in_days=-1, ends_in_days=None, **fields) -> Sale:
    now = timezone.now()
    return create_sale(
        name=fields.pop("name", "Season offer"),
        percent_off=Decimal(percent),
        starts_at=now + timedelta(days=starts_in_days),
        ends_at=None if ends_in_days is None else now + timedelta(days=ends_in_days),
        **fields,
    )


def _variant(price="1000.00", **fields) -> ProductVariant:
    return ProductVariantFactory(price=Decimal(price), product__is_active=True, **fields)


def _fresh(variant) -> ProductVariant:
    return ProductVariant.objects.select_related("product__category").get(id=variant.id)


def _brand(kind="stock", name="Aarong") -> Brand:
    return Brand.objects.create(name=name, slug=f"{name.lower()}-{kind}", kind=kind)


def test_a_running_storewide_sale_cuts_the_price_rounded_once():
    variant = _variant("999.99")
    _sale("12.50")

    assert _fresh(variant).sale_price == Decimal("874.99")
    assert _fresh(variant).effective_price == Decimal("874.99")


@pytest.mark.parametrize(
    ("starts_in_days", "ends_in_days", "is_active", "status"),
    [
        (1, None, True, "scheduled"),
        (-1, None, True, "running"),
        (-1, 1, True, "running"),
        (-2, -1, True, "ended"),
        (-1, None, False, "off"),
    ],
)
def test_only_a_running_sale_changes_the_price(starts_in_days, ends_in_days, is_active, status):
    variant = _variant()
    sale = _sale(starts_in_days=starts_in_days, ends_in_days=ends_in_days, is_active=is_active)

    assert sale.status == status
    expected = Decimal("800.00") if status == "running" else Decimal("1000.00")
    assert _fresh(variant).effective_price == expected


def test_the_biggest_percent_wins_when_sales_overlap():
    variant = _variant()
    _sale("10.00", name="Small")
    big = _sale(
        "30.00",
        name="Big",
        applies_to=Sale.AppliesTo.PRODUCTS,
        product_ids=[variant.product_id],
    )

    fresh = _fresh(variant)
    assert fresh.sale_price == Decimal("700.00")
    assert fresh.applied_sale.id == big.id


def test_the_customer_pays_the_lowest_of_list_discount_and_sale_price():
    cheaper_already = _variant(discount_price=Decimal("700.00"))
    sale_is_cheaper = _variant(discount_price=Decimal("900.00"))
    _sale("20.00")

    assert _fresh(cheaper_already).effective_price == Decimal("700.00")
    assert _fresh(cheaper_already).sale_price is None
    assert _fresh(sale_is_cheaper).effective_price == Decimal("800.00")


def test_a_category_sale_covers_child_categories_and_nothing_else():
    parent = CategoryFactory()
    child = CategoryFactory(parent=parent)
    in_child = _variant(product__category=child)
    elsewhere = _variant()
    _sale(applies_to=Sale.AppliesTo.CATEGORIES, category_ids=[parent.id])

    assert _fresh(in_child).effective_price == Decimal("800.00")
    assert _fresh(elsewhere).effective_price == Decimal("1000.00")


def test_a_brand_sale_covers_only_that_brand():
    brand = _brand()
    branded = _variant(product__brand=brand)
    other = _variant()
    _sale(applies_to=Sale.AppliesTo.BRANDS, brand_ids=[brand.id])

    assert _fresh(branded).effective_price == Decimal("800.00")
    assert _fresh(other).effective_price == Decimal("1000.00")


def test_a_preorder_product_is_never_discounted_by_a_sale():
    variant = _variant(product__category__category_type="preorder")
    _sale("50.00")

    assert _fresh(variant).sale_price is None
    assert _fresh(variant).effective_price == Decimal("1000.00")


def test_a_sale_refuses_preorder_targets():
    preorder_category = CategoryFactory(category_type="preorder")
    preorder_product = ProductFactory(category=preorder_category)
    cases = [
        (Sale.AppliesTo.CATEGORIES, {"category_ids": [preorder_category.id]}),
        (Sale.AppliesTo.BRANDS, {"brand_ids": [_brand(kind="preorder").id]}),
        (Sale.AppliesTo.PRODUCTS, {"product_ids": [preorder_product.id]}),
    ]
    for applies_to, ids in cases:
        with pytest.raises(BusinessRuleViolationError) as refused:
            _sale(applies_to=applies_to, **ids)
        assert refused.value.code == "sale_stock_only"
    assert not Sale.objects.exists()


def test_a_targeted_sale_needs_at_least_one_target():
    with pytest.raises(BusinessRuleViolationError) as refused:
        _sale(applies_to=Sale.AppliesTo.BRANDS, brand_ids=[])

    assert refused.value.code == "sale_target_required"


def test_a_sale_must_end_after_it_starts():
    with pytest.raises(BusinessRuleViolationError) as refused:
        _sale(starts_in_days=2, ends_in_days=1)

    assert refused.value.code == "sale_window_invalid"


def test_editing_or_deleting_a_sale_changes_prices_at_once():
    variant = _variant()
    sale = _sale("20.00")
    assert _fresh(variant).effective_price == Decimal("800.00")

    update_sale(sale=sale, percent_off=Decimal("40.00"))
    assert _fresh(variant).effective_price == Decimal("600.00")

    delete_sale(sale=sale)
    assert _fresh(variant).effective_price == Decimal("1000.00")


def test_admin_creates_reads_edits_and_deletes_a_sale(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    category = CategoryFactory(name="Knitwear")
    brand = _brand()
    now = timezone.now()

    created = api_client.post(
        SALES_URL,
        {
            "name": "Winter",
            "percent_off": "15.00",
            "starts_at": (now - timedelta(hours=1)).isoformat(),
            "ends_at": (now + timedelta(days=3)).isoformat(),
            "applies_to": "categories",
            "category_ids": [str(category.id)],
        },
        format="json",
    )

    assert created.status_code == 201, created.data
    row = created.data["data"]
    assert set(row) == {
        "id",
        "name",
        "percent_off",
        "starts_at",
        "ends_at",
        "is_active",
        "applies_to",
        "status",
        "categories",
        "brands",
        "products",
    }
    assert row["percent_off"] == "15.00"
    assert row["status"] == "running"
    assert row["is_active"] is True
    assert [dict(item) for item in row["categories"]] == [
        {"id": str(category.id), "name": "Knitwear"}
    ]
    detail_url = f"{SALES_URL}{row['id']}/"

    edited = api_client.patch(
        detail_url, {"applies_to": "brands", "brand_ids": [str(brand.id)]}, format="json"
    )
    assert edited.status_code == 200, edited.data
    assert edited.data["data"]["categories"] == []
    assert [item["name"] for item in edited.data["data"]["brands"]] == ["Aarong"]

    switched_off = api_client.patch(detail_url, {"is_active": False}, format="json")
    assert switched_off.data["data"]["status"] == "off"
    assert api_client.get(detail_url).data["data"]["name"] == "Winter"

    assert api_client.delete(detail_url).status_code == 200
    missing = api_client.get(detail_url)
    assert missing.status_code == 404
    assert missing.data["error"]["code"] == "sale_not_found"


def test_admin_list_is_paginated_and_filters_by_status(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    _sale(name="Now")
    _sale(name="Later", starts_in_days=2)
    _sale(name="Past", starts_in_days=-3, ends_in_days=-1)
    _sale(name="Paused", is_active=False)

    everything = api_client.get(SALES_URL)
    assert everything.status_code == 200
    assert len(everything.data["data"]["results"]) == 4

    for status, name in (
        ("running", "Now"),
        ("scheduled", "Later"),
        ("ended", "Past"),
        ("off", "Paused"),
    ):
        rows = api_client.get(f"{SALES_URL}?status={status}").data["data"]["results"]
        assert [row["name"] for row in rows] == [name], status


def test_admin_api_reports_the_rule_that_refused_a_sale(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    starts_at = timezone.now().isoformat()
    preorder_category = CategoryFactory(category_type="preorder")

    stock_only = api_client.post(
        SALES_URL,
        {
            "name": "Wrong half",
            "percent_off": "10",
            "starts_at": starts_at,
            "applies_to": "categories",
            "category_ids": [str(preorder_category.id)],
        },
        format="json",
    )
    no_target = api_client.post(
        SALES_URL,
        {"name": "Empty", "percent_off": "10", "starts_at": starts_at, "applies_to": "products"},
        format="json",
    )
    too_big = api_client.post(
        SALES_URL,
        {"name": "Free", "percent_off": "100", "starts_at": starts_at},
        format="json",
    )

    assert stock_only.status_code == 400
    assert stock_only.data["error"]["code"] == "sale_stock_only"
    assert no_target.data["error"]["code"] == "sale_target_required"
    assert too_big.status_code == 400
    assert not Sale.objects.exists()


def test_sales_need_the_same_permission_as_coupons(api_client, customer_user):
    assert api_client.get(SALES_URL).status_code in (401, 403)
    api_client.force_authenticate(user=customer_user)
    assert api_client.get(SALES_URL).status_code == 403


def test_public_product_carries_the_sale_and_each_variant_its_sale_price(api_client):
    on_sale = _variant("1000.00")
    discounted_lower = ProductVariantFactory(
        product=on_sale.product,
        price=Decimal("1000.00"),
        discount_price=Decimal("500.00"),
    )
    untouched = _variant(product__category__category_type="preorder")
    ends_at = timezone.now() + timedelta(days=2)
    create_sale(
        name="Eid offer",
        percent_off=Decimal("25.00"),
        starts_at=timezone.now() - timedelta(days=1),
        ends_at=ends_at,
    )

    rows = {row["id"]: row for row in api_client.get(PRODUCTS_URL).data["data"]["results"]}
    product = rows[str(on_sale.product_id)]
    variants = {row["id"]: row for row in product["variants"]}

    assert product["sale"]["name"] == "Eid offer"
    assert product["sale"]["percent_off"] == "25.00"
    assert product["sale"]["ends_at"] is not None
    assert variants[str(on_sale.id)]["sale_price"] == "750.00"
    assert variants[str(on_sale.id)]["effective_price"] == "750.00"
    assert variants[str(on_sale.id)]["compare_at_price"] == "1000.00"
    assert variants[str(discounted_lower.id)]["sale_price"] is None
    assert variants[str(discounted_lower.id)]["effective_price"] == "500.00"
    assert rows[str(untouched.product_id)]["sale"] is None
    assert rows[str(untouched.product_id)]["variants"][0]["sale_price"] is None

    detail = api_client.get(f"{PRODUCTS_URL}{on_sale.product.slug}/").data["data"]
    assert detail["sale"]["name"] == "Eid offer"


def test_a_parent_category_page_lists_the_products_of_its_child_categories(api_client):
    parent = CategoryFactory()
    child = CategoryFactory(parent=parent)
    ProductVariantFactory(product=ProductFactory(category=child, name="In the child"))
    ProductVariantFactory(product=ProductFactory(name="Elsewhere"))

    response = api_client.get(f"/api/v1/public/catalog/products/?category_id={parent.id}")

    assert [row["name"] for row in response.json()["data"]["results"]] == ["In the child"]
