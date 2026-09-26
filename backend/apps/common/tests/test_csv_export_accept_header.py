from __future__ import annotations

import pytest

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user

pytestmark = pytest.mark.django_db

# The browser client sets `Accept: text/csv` on every export download; without a
# renderer advertising it, DRF 406s during negotiation before the view runs.
EXPORT_URLS = [
    "/api/v1/admin/audit/export/",
    "/api/v1/admin/orders/export/",
    "/api/v1/admin/catalog/variants/export/",
    "/api/v1/admin/inventory/ledger-entries/export/",
    "/api/v1/admin/accounting/reports/profit-and-loss/?file_format=csv"
    "&start=2026-01-01&end=2026-12-31",
    "/api/v1/admin/accounting/reports/balance-sheet/?file_format=csv&as_of=2026-12-31",
    "/api/v1/admin/accounting/reports/cash-flow/?file_format=csv&start=2026-01-01&end=2026-12-31",
]


@pytest.fixture
def admin_client(api_client):
    api_client.force_authenticate(
        user=create_user(email="csv-export@example.com", role=UserRole.ADMIN)
    )
    return api_client


@pytest.mark.parametrize("url", EXPORT_URLS)
def test_export_accepts_text_csv_accept_header(admin_client, url):
    response = admin_client.get(url, HTTP_ACCEPT="text/csv")

    assert response.status_code == 200, response.content
    assert response["Content-Type"] == "text/csv"


@pytest.mark.parametrize("url", EXPORT_URLS)
def test_export_still_serves_clients_asking_for_json(admin_client, url):
    response = admin_client.get(url, HTTP_ACCEPT="application/json")

    assert response.status_code == 200, response.content


def test_accounting_report_still_returns_json_without_csv_format(admin_client):
    response = admin_client.get(
        "/api/v1/admin/accounting/reports/profit-and-loss/?start=2026-01-01&end=2026-12-31",
        HTTP_ACCEPT="application/json",
    )

    assert response.status_code == 200
    assert response["Content-Type"].startswith("application/json")
