from __future__ import annotations

import pytest
from django.core.cache import cache
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.constants import StaffPermissionCode
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import (
    ProductFactory,
    ProductQuestionFactory,
    ProductVariantFactory,
)
from apps.catalog.models import ProductQuestion

pytestmark = pytest.mark.django_db

ADMIN_URL = "/api/v1/admin/catalog/questions/"


def _ask_url(product) -> str:
    return f"/api/v1/customer/questions/products/{product.id}/"


def _public_url(product) -> str:
    return f"/api/v1/public/catalog/products/{product.slug}/questions/"


def _sellable_product(**kwargs):
    product = ProductFactory(is_active=True, **kwargs)
    ProductVariantFactory(product=product)
    return product


def _published(product, **kwargs):
    question = ProductQuestionFactory(product=product, **kwargs)
    question.answer = "Yes, fully."
    question.is_published = True
    question.save()
    return question


# --- Customer submission -----------------------------------------------------


def test_customer_can_ask_a_question(api_client, customer_user):
    product = _sellable_product()
    api_client.force_authenticate(user=customer_user)

    response = api_client.post(
        _ask_url(product), {"question": "  Does it fit A4?  "}, format="json"
    )

    assert response.status_code == 201, response.data
    data = response.data["data"]
    assert data["question"] == "Does it fit A4?"
    assert data["is_published"] is False
    assert data["answer"] == ""
    assert ProductQuestion.objects.get().customer == customer_user


def test_anonymous_user_cannot_ask(api_client):
    product = _sellable_product()

    response = api_client.post(_ask_url(product), {"question": "Hello?"}, format="json")

    assert response.status_code == 401
    assert not ProductQuestion.objects.exists()


def test_staff_cannot_ask_as_customer(api_client, admin_user):
    product = _sellable_product()
    api_client.force_authenticate(user=admin_user)

    response = api_client.post(_ask_url(product), {"question": "Hello?"}, format="json")

    assert response.status_code == 403


@pytest.mark.parametrize(
    "payload", [{}, {"question": ""}, {"question": "   "}, {"question": "x" * 1001}]
)
def test_invalid_question_is_rejected(api_client, customer_user, payload):
    product = _sellable_product()
    api_client.force_authenticate(user=customer_user)

    response = api_client.post(_ask_url(product), payload, format="json")

    assert response.status_code == 400
    assert "question" in response.data["error"]["fields"]


def test_question_about_an_inactive_product_is_not_found(api_client, customer_user):
    product = ProductFactory(is_active=False)
    ProductVariantFactory(product=product)
    api_client.force_authenticate(user=customer_user)

    response = api_client.post(_ask_url(product), {"question": "In stock?"}, format="json")

    assert response.status_code == 404
    assert response.data["error"]["code"] == "product_not_found"


def test_duplicate_pending_question_is_rejected(api_client, customer_user):
    product = _sellable_product()
    ProductQuestionFactory(customer=customer_user, product=product, question="In stock?")
    api_client.force_authenticate(user=customer_user)

    response = api_client.post(_ask_url(product), {"question": "In stock?"}, format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "duplicate_question"


def test_customer_lists_only_their_own_questions_including_pending(api_client, customer_user):
    product = _sellable_product()
    mine = ProductQuestionFactory(customer=customer_user, product=product)
    ProductQuestionFactory(product=product)
    api_client.force_authenticate(user=customer_user)

    response = api_client.get("/api/v1/customer/questions/")

    assert response.status_code == 200
    assert [row["id"] for row in response.data["data"]["results"]] == [str(mine.id)]


# --- Public visibility -------------------------------------------------------


def test_public_list_shows_only_answered_published_questions(api_client):
    product = _sellable_product()
    published = _published(product)
    ProductQuestionFactory(product=product)  # pending
    answered_unpublished = ProductQuestionFactory(product=product)
    answered_unpublished.answer = "Draft answer"
    answered_unpublished.save()
    _published(_sellable_product())  # another product's

    response = api_client.get(_public_url(product))

    assert response.status_code == 200
    rows = response.data["data"]["results"]
    assert [row["id"] for row in rows] == [str(published.id)]
    assert set(rows[0]) == {
        "id",
        "customer_name",
        "question",
        "answer",
        "created_at",
        "answered_at",
    }


def test_public_list_does_not_leak_customer_contact_details(api_client):
    product = _sellable_product()
    customer = create_user(email="private-asker@example.com")
    customer.first_name = ""
    customer.last_name = ""
    customer.save()
    _published(product, customer=customer)

    response = api_client.get(_public_url(product))

    row = response.data["data"]["results"][0]
    assert row["customer_name"] == "Anonymous"
    assert "private-asker" not in str(response.data)


def test_public_list_for_unknown_product_is_404(api_client):
    response = api_client.get("/api/v1/public/catalog/products/nope/questions/")

    assert response.status_code == 404


def test_public_question_list_query_count_does_not_grow(api_client):
    product = _sellable_product()
    _published(product)
    with CaptureQueriesContext(connection) as small:
        assert api_client.get(_public_url(product)).status_code == 200

    for _ in range(5):
        _published(product)
    with CaptureQueriesContext(connection) as large:
        assert api_client.get(_public_url(product)).status_code == 200

    assert len(large) == len(small)


# --- Admin moderation --------------------------------------------------------


def test_admin_answers_and_publishes_a_question(api_client, admin_user):
    product = _sellable_product()
    question = ProductQuestionFactory(product=product)
    api_client.force_authenticate(user=admin_user)

    response = api_client.patch(
        f"{ADMIN_URL}{question.id}/",
        {"answer": "Yes.", "is_published": True},
        format="json",
    )

    assert response.status_code == 200, response.data
    assert response.data["data"]["is_published"] is True
    question.refresh_from_db()
    assert question.answered_by == admin_user
    assert question.answered_at is not None
    api_client.force_authenticate(user=None)
    public = api_client.get(_public_url(product)).data["data"]["results"]
    assert [row["id"] for row in public] == [str(question.id)]


def test_publishing_without_answer_is_rejected(api_client, admin_user):
    question = ProductQuestionFactory(product=_sellable_product())
    api_client.force_authenticate(user=admin_user)

    response = api_client.patch(f"{ADMIN_URL}{question.id}/", {"is_published": True}, format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "answer_required"


def test_clearing_the_answer_unpublishes(api_client, admin_user):
    question = _published(_sellable_product())
    api_client.force_authenticate(user=admin_user)

    response = api_client.patch(f"{ADMIN_URL}{question.id}/", {"answer": ""}, format="json")

    assert response.status_code == 200
    question.refresh_from_db()
    assert question.is_published is False
    assert question.answered_by is None


def test_admin_list_filters_by_status(api_client, admin_user):
    product = _sellable_product()
    pending = ProductQuestionFactory(product=product)
    published = _published(product)
    api_client.force_authenticate(user=admin_user)

    pending_rows = api_client.get(ADMIN_URL, {"status": "pending"}).data["data"]["results"]
    published_rows = api_client.get(ADMIN_URL, {"status": "published"}).data["data"]["results"]

    assert [row["id"] for row in pending_rows] == [str(pending.id)]
    assert [row["id"] for row in published_rows] == [str(published.id)]


def test_admin_can_delete_a_question(api_client, admin_user):
    question = ProductQuestionFactory(product=_sellable_product())
    api_client.force_authenticate(user=admin_user)

    assert api_client.delete(f"{ADMIN_URL}{question.id}/").status_code == 204
    assert not ProductQuestion.objects.exists()


def test_catalog_view_staff_can_read_but_not_moderate(api_client, staff_user):
    question = ProductQuestionFactory(product=_sellable_product())
    set_staff_permission(
        staff_user=staff_user, permission_code=StaffPermissionCode.CATALOG_VIEW, is_enabled=True
    )
    api_client.force_authenticate(user=staff_user)

    assert api_client.get(ADMIN_URL).status_code == 200
    response = api_client.patch(f"{ADMIN_URL}{question.id}/", {"answer": "x"}, format="json")
    assert response.status_code == 403


def test_customer_cannot_reach_admin_queue(api_client, customer_user):
    api_client.force_authenticate(user=customer_user)

    assert api_client.get(ADMIN_URL).status_code == 403


def test_admin_question_list_query_count_does_not_grow(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    _published(_sellable_product())
    with CaptureQueriesContext(connection) as small:
        assert api_client.get(ADMIN_URL).status_code == 200

    for _ in range(5):
        _published(_sellable_product())
        ProductQuestionFactory(product=_sellable_product())
    with CaptureQueriesContext(connection) as large:
        assert api_client.get(ADMIN_URL).status_code == 200

    assert len(large) == len(small)


# --- Throttling --------------------------------------------------------------


def test_question_submission_is_throttled_per_customer(api_client, customer_user, settings):
    cache.clear()
    settings.REST_FRAMEWORK = {
        **settings.REST_FRAMEWORK,
        "DEFAULT_THROTTLE_RATES": {
            **settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
            "product_question": "2/hour",
        },
    }
    product = _sellable_product()
    api_client.force_authenticate(user=customer_user)

    statuses = [
        api_client.post(
            _ask_url(product), {"question": f"Question {n}?"}, format="json"
        ).status_code
        for n in range(3)
    ]
    cache.clear()

    assert statuses == [201, 201, 429]
