from __future__ import annotations

import pytest

from apps.catalog.factories import (
    CategoryFactory,
    ProductFactory,
    ProductReviewFactory,
    ProductVariantFactory,
)
from apps.orders.factories import SalesOrderFactory, SalesOrderLineFactory
from apps.orders.models import SalesOrder

pytestmark = pytest.mark.django_db

BASE = "/api/v1/admin/catalog/products/"


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


def _row(client, product) -> dict:
    rows = client.get(BASE).data["data"]["results"]
    return next(row for row in rows if row["id"] == str(product.id))


def test_admin_product_says_who_added_it(admin_client, admin_user):
    response = admin_client.post(
        BASE,
        {"name": "Tee", "category_id": str(CategoryFactory().id), "price": "10"},
        format="json",
    )
    assert response.status_code == 201
    label = admin_user.get_full_name() or admin_user.email

    listed = admin_client.get(BASE).data["data"]["results"][0]
    assert listed["added_by"] == label
    detail = admin_client.get(f"{BASE}{listed['id']}/").data["data"]
    assert detail["added_by"] == label


def test_admin_product_without_a_creator_on_record_has_no_added_by(admin_client):
    assert _row(admin_client, ProductFactory())["added_by"] is None


def test_admin_product_counts_units_sold_without_carts_cancelled_or_returns(admin_client):
    product = ProductFactory()
    variant = ProductVariantFactory(product=product)

    def line(status, quantity, returned=0):
        order = SalesOrderFactory(status=status)
        SalesOrderLineFactory(
            order=order,
            variant=variant,
            quantity=quantity,
            shipped_quantity=returned,
            returned_quantity=returned,
        )

    line(SalesOrder.Status.DELIVERED, 5, returned=1)
    line(SalesOrder.Status.CONFIRMED, 2)
    line(SalesOrder.Status.PENDING, 7)
    line(SalesOrder.Status.CANCELLED, 9)

    assert _row(admin_client, product)["units_sold"] == 6
    assert _row(admin_client, ProductFactory())["units_sold"] == 0


def test_admin_product_carries_its_rating(admin_client):
    product = ProductFactory()
    ProductReviewFactory(product=product, rating=5)
    ProductReviewFactory(product=product, rating=4)

    row = _row(admin_client, product)
    assert row["average_rating"] == 4.5
    assert row["review_count"] == 2

    unrated = _row(admin_client, ProductFactory())
    assert unrated["average_rating"] is None
    assert unrated["review_count"] == 0


def test_admin_switches_published_and_featured(admin_client):
    product = ProductFactory()
    url = f"{BASE}{product.id}/"

    assert admin_client.patch(url, {"is_active": False}, format="json").status_code == 200
    assert admin_client.patch(url, {"featured": True}, format="json").status_code == 200

    product.refresh_from_db()
    assert product.is_active is False
    assert product.featured is True


def test_admin_creates_a_product_unpublished(admin_client):
    payload = {"name": "Draft tee", "category_id": str(CategoryFactory().id), "price": "10"}

    draft = admin_client.post(BASE, {**payload, "is_active": False}, format="json")
    assert draft.status_code == 201
    assert draft.data["data"]["is_active"] is False

    published = admin_client.post(BASE, {**payload, "name": "Live tee"}, format="json")
    assert published.data["data"]["is_active"] is True
