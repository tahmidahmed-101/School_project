from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductFactory, ProductReviewFactory, ProductVariantFactory
from apps.orders.factories import SalesOrderFactory, SalesOrderLineFactory
from apps.orders.models import SalesOrder

pytestmark = pytest.mark.django_db


def _delivered_purchase(customer, product):
    variant = ProductVariantFactory(product=product)
    order = SalesOrderFactory(customer=customer, status=SalesOrder.Status.DELIVERED)
    SalesOrderLineFactory(order=order, variant=variant)
    return variant


def test_customer_with_delivered_order_can_review_product(api_client):
    customer = create_user(email="review-buyer@example.com")
    api_client.force_authenticate(user=customer)
    product = ProductFactory()
    _delivered_purchase(customer, product)

    response = api_client.post(
        f"/api/v1/customer/reviews/products/{product.id}/",
        {"rating": 5, "comment": "Loved it"},
        format="json",
    )

    assert response.status_code == 201, response.data
    assert response.data["data"]["is_verified_purchase"] is True


def test_review_without_purchase_is_rejected(api_client):
    customer = create_user(email="review-no-purchase@example.com")
    api_client.force_authenticate(user=customer)
    product = ProductFactory()
    ProductVariantFactory(product=product)

    response = api_client.post(
        f"/api/v1/customer/reviews/products/{product.id}/",
        {"rating": 4, "comment": "Never bought it"},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "purchase_required"


def test_duplicate_review_is_rejected(api_client):
    customer = create_user(email="review-dup@example.com")
    api_client.force_authenticate(user=customer)
    product = ProductFactory()
    _delivered_purchase(customer, product)
    ProductReviewFactory(customer=customer, product=product)

    response = api_client.post(
        f"/api/v1/customer/reviews/products/{product.id}/",
        {"rating": 3, "comment": "Again"},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "already_reviewed"


def test_rating_out_of_range_is_rejected(api_client):
    customer = create_user(email="review-badrating@example.com")
    api_client.force_authenticate(user=customer)
    product = ProductFactory()
    _delivered_purchase(customer, product)

    response = api_client.post(
        f"/api/v1/customer/reviews/products/{product.id}/",
        {"rating": 7, "comment": "Too high"},
        format="json",
    )

    assert response.status_code == 400


def test_customer_can_edit_and_delete_own_review(api_client):
    customer = create_user(email="review-owner@example.com")
    api_client.force_authenticate(user=customer)
    product = ProductFactory()
    review = ProductReviewFactory(customer=customer, product=product, rating=3)

    patch_response = api_client.patch(
        f"/api/v1/customer/reviews/{review.id}/", {"rating": 5}, format="json"
    )
    assert patch_response.status_code == 200
    assert patch_response.data["data"]["rating"] == 5

    delete_response = api_client.delete(f"/api/v1/customer/reviews/{review.id}/")
    assert delete_response.status_code == 204


def test_customer_cannot_edit_another_customers_review(api_client):
    owner = create_user(email="review-owner2@example.com")
    intruder = create_user(email="review-intruder@example.com")
    review = ProductReviewFactory(customer=owner)

    api_client.force_authenticate(user=intruder)
    response = api_client.patch(
        f"/api/v1/customer/reviews/{review.id}/", {"rating": 1}, format="json"
    )

    assert response.status_code == 404


def test_admin_can_moderate_delete_any_review(api_client):
    admin = create_user(email="review-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    review = ProductReviewFactory()

    response = api_client.delete(f"/api/v1/admin/catalog/reviews/{review.id}/")

    assert response.status_code == 204


def test_public_can_list_product_reviews_with_summary(api_client):
    product = ProductFactory()
    ProductVariantFactory(product=product)
    ProductReviewFactory(product=product, rating=4)
    ProductReviewFactory(product=product, rating=2)

    response = api_client.get(f"/api/v1/public/catalog/products/{product.slug}/reviews/")

    assert response.status_code == 200
    assert response.data["data"]["count"] == 2
    assert response.data["data"]["review_count"] == 2
    assert response.data["data"]["average_rating"] == 3.0


def test_product_review_list_query_count_does_not_grow_with_reviews(api_client):
    product = ProductFactory()
    ProductVariantFactory(product=product)
    ProductReviewFactory(product=product)
    with CaptureQueriesContext(connection) as small:
        assert (
            api_client.get(f"/api/v1/public/catalog/products/{product.slug}/reviews/").status_code
            == 200
        )

    for _ in range(5):
        ProductReviewFactory(product=product)
    with CaptureQueriesContext(connection) as large:
        assert (
            api_client.get(f"/api/v1/public/catalog/products/{product.slug}/reviews/").status_code
            == 200
        )

    assert len(large) == len(small)
