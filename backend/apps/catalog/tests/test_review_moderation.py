from __future__ import annotations

import pytest

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.business.constants import ModuleKey
from apps.business.services.modules import set_module_config
from apps.catalog.factories import ProductFactory, ProductReviewFactory, ProductVariantFactory
from apps.catalog.models import ProductReview
from apps.orders.factories import SalesOrderFactory, SalesOrderLineFactory
from apps.orders.models import SalesOrder

pytestmark = pytest.mark.django_db


def _require_approval():
    set_module_config(key=ModuleKey.CATALOG, config={"review_approval": True})


def _product():
    product = ProductFactory()
    ProductVariantFactory(product=product)
    return product


def _public_reviews(api_client, product):
    api_client.force_authenticate(user=None)
    return api_client.get(f"/api/v1/public/catalog/products/{product.slug}/reviews/").data["data"]


def _admin(api_client):
    api_client.force_authenticate(
        user=create_user(email="moderator@example.com", role=UserRole.ADMIN)
    )


def test_reviews_show_at_once_when_the_shop_does_not_approve_them(api_client):
    customer = create_user(email="instant@example.com")
    product = _product()
    order = SalesOrderFactory(customer=customer, status=SalesOrder.Status.DELIVERED)
    SalesOrderLineFactory(order=order, variant=product.variants.first())
    api_client.force_authenticate(user=customer)

    response = api_client.post(
        f"/api/v1/customer/reviews/products/{product.id}/", {"rating": 5}, format="json"
    )

    assert response.data["data"]["status"] == ProductReview.Status.PUBLISHED
    assert _public_reviews(api_client, product)["count"] == 1


def test_an_approved_shop_holds_new_reviews_until_staff_publish_them(api_client):
    _require_approval()
    customer = create_user(email="waits@example.com")
    product = _product()
    order = SalesOrderFactory(customer=customer, status=SalesOrder.Status.DELIVERED)
    SalesOrderLineFactory(order=order, variant=product.variants.first())
    api_client.force_authenticate(user=customer)

    created = api_client.post(
        f"/api/v1/customer/reviews/products/{product.id}/", {"rating": 1}, format="json"
    ).data["data"]

    assert created["status"] == ProductReview.Status.PENDING
    public = _public_reviews(api_client, product)
    assert (public["count"], public["review_count"]) == (0, 0)

    _admin(api_client)
    pending = api_client.get("/api/v1/admin/catalog/reviews/", {"status": "pending"})
    assert [row["id"] for row in pending.data["data"]["results"]] == [created["id"]]
    published = api_client.patch(
        f"/api/v1/admin/catalog/reviews/{created['id']}/", {"status": "published"}, format="json"
    )
    assert published.status_code == 200
    assert published.data["data"]["moderated_at"] is not None

    public = _public_reviews(api_client, product)
    assert (public["count"], public["average_rating"]) == (1, 1.0)


def test_a_hidden_review_leaves_the_storefront_and_its_rating(api_client):
    product = _product()
    ProductReviewFactory(product=product, rating=5)
    review = ProductReviewFactory(product=product, rating=1)
    _admin(api_client)

    response = api_client.patch(
        f"/api/v1/admin/catalog/reviews/{review.id}/",
        {"status": "hidden", "note": "Abusive language"},
        format="json",
    )

    assert response.data["data"]["moderation_note"] == "Abusive language"
    public = _public_reviews(api_client, product)
    assert (public["count"], public["average_rating"]) == (1, 5.0)


def test_editing_an_approved_review_sends_it_back_for_approval(api_client):
    _require_approval()
    customer = create_user(email="edits@example.com")
    review = ProductReviewFactory(customer=customer, rating=5)
    api_client.force_authenticate(user=customer)

    response = api_client.patch(
        f"/api/v1/customer/reviews/{review.id}/", {"comment": "Changed my mind"}, format="json"
    )

    assert response.data["data"]["status"] == ProductReview.Status.PENDING


def test_staff_cannot_set_a_review_back_to_pending(api_client):
    review = ProductReviewFactory()
    _admin(api_client)

    response = api_client.patch(
        f"/api/v1/admin/catalog/reviews/{review.id}/", {"status": "pending"}, format="json"
    )

    assert response.status_code == 400
