from __future__ import annotations

import pytest

from apps.catalog.factories import CategoryFactory, ProductFactory, ProductVariantFactory
from apps.catalog.models import PriceIssueReport, ProductQuestion

pytestmark = pytest.mark.django_db

ADMIN_URL = "/api/v1/admin/catalog/products/"


def _sellable_product(**kwargs):
    product = ProductFactory(is_active=True, **kwargs)
    ProductVariantFactory(product=product)
    return product


def test_new_product_shows_both_sections_by_default(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    response = api_client.post(
        ADMIN_URL, {"category_id": str(CategoryFactory().id), "name": "Mug"}, format="json"
    )

    assert response.status_code == 201, response.data
    assert response.data["data"]["show_questions"] is True
    assert response.data["data"]["show_price_report"] is True


def test_staff_can_turn_the_sections_off(api_client, admin_user):
    product = _sellable_product()
    api_client.force_authenticate(user=admin_user)

    response = api_client.patch(
        f"{ADMIN_URL}{product.id}/",
        {"show_questions": False, "show_price_report": False},
        format="json",
    )

    assert response.status_code == 200, response.data
    product.refresh_from_db()
    assert product.show_questions is False
    assert product.show_price_report is False


def test_public_detail_carries_the_switches(api_client):
    product = _sellable_product(show_questions=False)

    response = api_client.get(f"/api/v1/public/catalog/products/{product.slug}/")

    assert response.status_code == 200
    assert response.data["data"]["show_questions"] is False
    assert response.data["data"]["show_price_report"] is True


def test_question_is_refused_when_questions_are_off(api_client, customer_user):
    product = _sellable_product(show_questions=False)
    api_client.force_authenticate(user=customer_user)

    response = api_client.post(
        f"/api/v1/customer/questions/products/{product.id}/",
        {"question": "Does it fit A4?"},
        format="json",
    )

    assert response.status_code == 400
    assert not ProductQuestion.objects.exists()


def test_price_report_is_refused_when_price_reports_are_off(api_client, customer_user):
    product = _sellable_product(show_price_report=False)
    api_client.force_authenticate(user=customer_user)

    response = api_client.post(
        f"/api/v1/customer/price-reports/products/{product.id}/",
        {"comment": "Price looks doubled"},
        format="json",
    )

    assert response.status_code == 400
    assert not PriceIssueReport.objects.exists()
