from __future__ import annotations

import pytest

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.marketing.factories import NewsletterSubscriberFactory
from apps.marketing.models import NewsletterSubscriber

pytestmark = pytest.mark.django_db


def test_anonymous_can_subscribe_to_newsletter(api_client):
    response = api_client.post(
        "/api/v1/public/marketing/subscribe/", {"email": "new-subscriber@example.com"}
    )

    assert response.status_code == 201
    assert NewsletterSubscriber.objects.filter(
        email="new-subscriber@example.com", is_active=True
    ).exists()


def test_duplicate_active_subscription_is_rejected(api_client):
    NewsletterSubscriberFactory(email="already-in@example.com")

    response = api_client.post(
        "/api/v1/public/marketing/subscribe/", {"email": "already-in@example.com"}
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "already_subscribed"


def test_resubscribing_after_unsubscribe_reactivates(api_client):
    NewsletterSubscriberFactory(email="comeback@example.com", is_active=False)

    response = api_client.post(
        "/api/v1/public/marketing/subscribe/", {"email": "comeback@example.com"}
    )

    assert response.status_code == 201
    subscriber = NewsletterSubscriber.objects.get(email="comeback@example.com")
    assert subscriber.is_active is True
    assert subscriber.unsubscribed_at is None


def test_unsubscribe_unknown_email_answers_like_a_known_one(api_client):
    # The same reply either way, so the endpoint cannot reveal who is subscribed.
    response = api_client.post(
        "/api/v1/public/marketing/unsubscribe/", {"email": "never-subscribed@example.com"}
    )

    assert response.status_code == 200
    assert response.data == {"data": {}, "message": "Success"}


def test_unsubscribe_active_subscriber(api_client):
    NewsletterSubscriberFactory(email="leaving@example.com")

    response = api_client.post(
        "/api/v1/public/marketing/unsubscribe/", {"email": "leaving@example.com"}
    )

    assert response.status_code == 200
    subscriber = NewsletterSubscriber.objects.get(email="leaving@example.com")
    assert subscriber.is_active is False
    assert subscriber.unsubscribed_at is not None


def test_admin_can_list_subscribers(api_client):
    admin = create_user(email="marketing-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    NewsletterSubscriberFactory(email="listed@example.com")

    response = api_client.get("/api/v1/admin/marketing/subscribers/")

    assert response.status_code == 200
    emails = [row["email"] for row in response.data["data"]["results"]]
    assert "listed@example.com" in emails


def test_admin_can_create_subscriber(api_client):
    admin = create_user(email="marketing-create-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.post(
        "/api/v1/admin/marketing/subscribers/",
        {"email": "Added@Example.com", "is_active": True},
    )

    assert response.status_code == 201
    assert response.data["data"]["email"] == "added@example.com"
    assert NewsletterSubscriber.objects.filter(email="added@example.com", is_active=True).exists()


def test_admin_cannot_create_duplicate_subscriber(api_client):
    admin = create_user(email="marketing-duplicate-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    NewsletterSubscriberFactory(email="dupe@example.com")

    response = api_client.post(
        "/api/v1/admin/marketing/subscribers/",
        {"email": "dupe@example.com"},
    )

    assert response.status_code == 400
    assert "email" in response.data["error"]["fields"]


def test_admin_can_update_subscriber(api_client):
    admin = create_user(email="marketing-update-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    subscriber = NewsletterSubscriberFactory(email="old@example.com", is_active=True)

    response = api_client.patch(
        f"/api/v1/admin/marketing/subscribers/{subscriber.id}/",
        {"email": "new@example.com", "is_active": False},
    )

    assert response.status_code == 200
    subscriber.refresh_from_db()
    assert subscriber.email == "new@example.com"
    assert subscriber.is_active is False
    assert subscriber.unsubscribed_at is not None


def test_admin_can_delete_subscriber(api_client):
    admin = create_user(email="marketing-delete-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    subscriber = NewsletterSubscriberFactory(email="remove@example.com")

    response = api_client.delete(f"/api/v1/admin/marketing/subscribers/{subscriber.id}/")

    assert response.status_code == 204
    assert not NewsletterSubscriber.objects.filter(id=subscriber.id).exists()


def test_customer_cannot_list_admin_subscribers(api_client):
    customer = create_user(email="marketing-customer@example.com")
    api_client.force_authenticate(user=customer)

    response = api_client.get("/api/v1/admin/marketing/subscribers/")

    assert response.status_code == 403


def test_subscriber_export_honours_is_active_filter(api_client):
    admin = create_user(email="marketing-export-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    NewsletterSubscriberFactory(email="active-sub@example.com", is_active=True)
    NewsletterSubscriberFactory(email="inactive-sub@example.com", is_active=False)

    response = api_client.get("/api/v1/admin/marketing/subscribers/export/?is_active=true")

    assert response.status_code == 200
    body = response.content.decode()
    assert "active-sub@example.com" in body
    assert "inactive-sub@example.com" not in body
