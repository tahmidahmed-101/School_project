from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductFactory, ProductVariantFactory, WishlistItemFactory

pytestmark = pytest.mark.django_db


def test_customer_can_add_list_and_remove_wishlist_item(api_client):
    customer = create_user(email="wishlist-owner@example.com")
    api_client.force_authenticate(user=customer)
    product = ProductFactory()
    ProductVariantFactory(product=product)

    add_response = api_client.post(
        "/api/v1/customer/wishlist/", {"product_id": str(product.id)}, format="json"
    )
    assert add_response.status_code == 201
    assert add_response.data["data"]["product"]["name"] == product.name

    list_response = api_client.get("/api/v1/customer/wishlist/")
    assert list_response.status_code == 200
    assert list_response.data["data"]["count"] == 1

    delete_response = api_client.delete(f"/api/v1/customer/wishlist/{product.id}/")
    assert delete_response.status_code == 204

    list_response = api_client.get("/api/v1/customer/wishlist/")
    assert list_response.data["data"]["count"] == 0


def test_duplicate_wishlist_add_is_rejected(api_client):
    customer = create_user(email="wishlist-dup@example.com")
    api_client.force_authenticate(user=customer)
    product = ProductFactory()
    WishlistItemFactory(customer=customer, product=product)

    response = api_client.post(
        "/api/v1/customer/wishlist/", {"product_id": str(product.id)}, format="json"
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "already_in_wishlist"


def test_wishlist_add_with_unknown_product_is_404(api_client):
    customer = create_user(email="wishlist-unknown@example.com")
    api_client.force_authenticate(user=customer)

    response = api_client.post(
        "/api/v1/customer/wishlist/",
        {"product_id": "00000000-0000-0000-0000-000000000000"},
        format="json",
    )

    assert response.status_code == 404


def test_customer_cannot_see_or_remove_another_customers_wishlist_item(api_client):
    owner = create_user(email="wishlist-owner2@example.com")
    intruder = create_user(email="wishlist-intruder@example.com")
    product = ProductFactory()
    WishlistItemFactory(customer=owner, product=product)

    api_client.force_authenticate(user=intruder)
    list_response = api_client.get("/api/v1/customer/wishlist/")
    assert list_response.data["data"]["count"] == 0

    delete_response = api_client.delete(f"/api/v1/customer/wishlist/{product.id}/")
    assert delete_response.status_code == 404


def test_wishlist_list_query_count_does_not_grow_with_items(api_client):
    customer = create_user(email="wishlist-perf@example.com")
    api_client.force_authenticate(user=customer)

    for _ in range(2):
        product = ProductFactory()
        ProductVariantFactory(product=product)
        WishlistItemFactory(customer=customer, product=product)
    with CaptureQueriesContext(connection) as small:
        assert api_client.get("/api/v1/customer/wishlist/").status_code == 200

    for _ in range(6):
        product = ProductFactory()
        ProductVariantFactory(product=product)
        WishlistItemFactory(customer=customer, product=product)
    with CaptureQueriesContext(connection) as large:
        assert api_client.get("/api/v1/customer/wishlist/").status_code == 200

    assert len(large) == len(small)
