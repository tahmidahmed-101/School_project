from __future__ import annotations

from decimal import Decimal

import pytest
from django.core.cache import cache
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.constants import StaffPermissionCode
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.catalog.factories import (
    PriceIssueReportFactory,
    ProductFactory,
    ProductVariantFactory,
)
from apps.catalog.models import PriceIssueReport
from apps.catalog.selectors.sales import live_sales

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _live_sales_already_loaded(db):
    live_sales()


ADMIN_URL = "/api/v1/admin/catalog/price-reports/"


def _report_url(product) -> str:
    return f"/api/v1/customer/price-reports/products/{product.id}/"


def _sellable_variant():
    product = ProductFactory(is_active=True)
    return ProductVariantFactory(product=product, price=Decimal("500.00"))


# --- Customer submission -----------------------------------------------------


def test_customer_can_report_a_variant_price(api_client, customer_user):
    variant = _sellable_variant()
    api_client.force_authenticate(user=customer_user)

    response = api_client.post(
        _report_url(variant.product),
        {"variant_id": str(variant.id), "expected_price": "450.00", "comment": "Shelf says 450"},
        format="json",
    )

    assert response.status_code == 201, response.data
    assert set(response.data["data"]) == {
        "id",
        "product_id",
        "variant_id",
        "expected_price",
        "comment",
        "created_at",
    }
    report = PriceIssueReport.objects.get()
    assert report.reporter == customer_user
    assert report.variant == variant
    assert report.status == PriceIssueReport.Status.OPEN


def test_comment_alone_is_enough(api_client, customer_user):
    variant = _sellable_variant()
    api_client.force_authenticate(user=customer_user)

    response = api_client.post(
        _report_url(variant.product), {"comment": "Price looks doubled"}, format="json"
    )

    assert response.status_code == 201, response.data
    assert response.data["data"]["variant_id"] is None


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"comment": "   "},
        {"expected_price": "0"},
        {"expected_price": "-5"},
        {"expected_price": "abc"},
        {"comment": "x" * 1001},
    ],
)
def test_invalid_report_is_rejected(api_client, customer_user, payload):
    variant = _sellable_variant()
    api_client.force_authenticate(user=customer_user)

    response = api_client.post(_report_url(variant.product), payload, format="json")

    assert response.status_code == 400
    assert not PriceIssueReport.objects.exists()


def test_variant_of_another_product_is_rejected(api_client, customer_user):
    variant = _sellable_variant()
    other = _sellable_variant()
    api_client.force_authenticate(user=customer_user)

    response = api_client.post(
        _report_url(variant.product),
        {"variant_id": str(other.id), "comment": "wrong"},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "variant_mismatch"


def test_unknown_variant_is_rejected(api_client, customer_user):
    variant = _sellable_variant()
    api_client.force_authenticate(user=customer_user)

    response = api_client.post(
        _report_url(variant.product),
        {"variant_id": "00000000-0000-0000-0000-000000000000", "comment": "wrong"},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "variant_not_found"


def test_inactive_product_is_not_found(api_client, customer_user):
    product = ProductFactory(is_active=False)
    ProductVariantFactory(product=product)
    api_client.force_authenticate(user=customer_user)

    response = api_client.post(_report_url(product), {"comment": "wrong"}, format="json")

    assert response.status_code == 404


def test_duplicate_open_report_is_rejected_but_a_closed_one_allows_another(
    api_client, customer_user
):
    variant = _sellable_variant()
    existing = PriceIssueReportFactory(
        reporter=customer_user, product=variant.product, variant=variant
    )
    api_client.force_authenticate(user=customer_user)
    payload = {"variant_id": str(variant.id), "comment": "Again"}

    duplicate = api_client.post(_report_url(variant.product), payload, format="json")
    existing.status = PriceIssueReport.Status.RESOLVED
    existing.save()
    after_close = api_client.post(_report_url(variant.product), payload, format="json")

    assert duplicate.status_code == 400
    assert duplicate.data["error"]["code"] == "already_reported"
    assert after_close.status_code == 201


def test_anonymous_cannot_report(api_client):
    variant = _sellable_variant()

    response = api_client.post(_report_url(variant.product), {"comment": "x"}, format="json")

    assert response.status_code == 401


def test_reports_have_no_public_or_customer_read_endpoint(api_client, customer_user):
    variant = _sellable_variant()
    PriceIssueReportFactory(reporter=customer_user, product=variant.product)
    api_client.force_authenticate(user=customer_user)

    assert api_client.get(_report_url(variant.product)).status_code == 405
    assert api_client.get(ADMIN_URL).status_code == 403


# --- Admin review ------------------------------------------------------------


def test_admin_lists_and_resolves_reports(api_client, admin_user):
    variant = _sellable_variant()
    report = PriceIssueReportFactory(
        product=variant.product, variant=variant, expected_price=Decimal("450.00")
    )
    api_client.force_authenticate(user=admin_user)

    listing = api_client.get(ADMIN_URL, {"status": "open"})
    response = api_client.patch(
        f"{ADMIN_URL}{report.id}/",
        {"status": "resolved", "staff_note": "Price corrected"},
        format="json",
    )

    assert listing.status_code == 200
    row = listing.data["data"]["results"][0]
    assert row["current_price"] == "500.00"
    assert row["variant_sku"] == variant.sku
    assert response.status_code == 200, response.data
    report.refresh_from_db()
    assert report.status == PriceIssueReport.Status.RESOLVED
    assert report.resolved_by == admin_user
    assert report.resolved_at is not None


def test_reopening_clears_resolution(api_client, admin_user):
    report = PriceIssueReportFactory(product=_sellable_variant().product)
    api_client.force_authenticate(user=admin_user)
    api_client.patch(f"{ADMIN_URL}{report.id}/", {"status": "dismissed"}, format="json")

    api_client.patch(f"{ADMIN_URL}{report.id}/", {"status": "open"}, format="json")

    report.refresh_from_db()
    assert report.resolved_by is None
    assert report.resolved_at is None


def test_invalid_status_is_rejected(api_client, admin_user):
    report = PriceIssueReportFactory(product=_sellable_variant().product)
    api_client.force_authenticate(user=admin_user)

    response = api_client.patch(f"{ADMIN_URL}{report.id}/", {"status": "bogus"}, format="json")

    assert response.status_code == 400


def test_catalog_view_staff_can_read_but_not_update(api_client, staff_user):
    report = PriceIssueReportFactory(product=_sellable_variant().product)
    set_staff_permission(
        staff_user=staff_user, permission_code=StaffPermissionCode.CATALOG_VIEW, is_enabled=True
    )
    api_client.force_authenticate(user=staff_user)

    assert api_client.get(f"{ADMIN_URL}{report.id}/").status_code == 200
    response = api_client.patch(f"{ADMIN_URL}{report.id}/", {"status": "resolved"}, format="json")
    assert response.status_code == 403


def test_staff_without_catalog_permission_is_refused(api_client, staff_user):
    api_client.force_authenticate(user=staff_user)

    assert api_client.get(ADMIN_URL).status_code == 403


def test_admin_report_list_query_count_does_not_grow(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    variant = _sellable_variant()
    PriceIssueReportFactory(product=variant.product, variant=variant)
    with CaptureQueriesContext(connection) as small:
        assert api_client.get(ADMIN_URL).status_code == 200

    for _ in range(5):
        other = _sellable_variant()
        PriceIssueReportFactory(product=other.product, variant=other)
    with CaptureQueriesContext(connection) as large:
        assert api_client.get(ADMIN_URL).status_code == 200

    assert len(large) == len(small)


# --- Throttling --------------------------------------------------------------


def test_price_reports_are_throttled_per_customer(api_client, customer_user, settings):
    cache.clear()
    settings.REST_FRAMEWORK = {
        **settings.REST_FRAMEWORK,
        "DEFAULT_THROTTLE_RATES": {
            **settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
            "price_report": "2/hour",
        },
    }
    api_client.force_authenticate(user=customer_user)

    statuses = [
        api_client.post(
            _report_url(_sellable_variant().product), {"comment": "wrong"}, format="json"
        ).status_code
        for _ in range(3)
    ]
    cache.clear()

    assert statuses == [201, 201, 429]
