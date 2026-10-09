from __future__ import annotations

import pytest

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.orders.factories import SalesOrderFactory
from apps.orders.models import SalesOrder
from apps.risk.factories import FraudCaseFactory

pytestmark = pytest.mark.django_db

URL = "/api/v1/admin/risk/cases/"


@pytest.fixture
def admin_client(api_client):
    api_client.force_authenticate(
        user=create_user(email="risk-kind-admin@example.com", role=UserRole.ADMIN)
    )
    return api_client


def _case(kind):
    return FraudCaseFactory(
        order=SalesOrderFactory(status=SalesOrder.Status.CONFIRMED, order_type=kind)
    )


def _rows(client, **params):
    response = client.get(URL, params)
    assert response.status_code == 200, response.data
    return [(row["id"], row["order_type"]) for row in response.data["data"]["results"]]


def test_fraud_cases_filter_by_the_orders_kind(admin_client):
    stock_case = _case("stock")
    preorder_case = _case("preorder")

    assert len(_rows(admin_client)) == 2
    assert _rows(admin_client, kind="stock") == [(str(stock_case.id), "stock")]
    assert _rows(admin_client, kind="preorder") == [(str(preorder_case.id), "preorder")]


def test_fraud_case_detail_carries_order_type(admin_client):
    case = _case("preorder")

    response = admin_client.get(f"{URL}{case.id}/")

    assert response.data["data"]["order_type"] == "preorder"


def test_unknown_kind_is_a_400(admin_client):
    assert admin_client.get(URL, {"kind": "mixed"}).status_code == 400
