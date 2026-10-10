"""Staff hear on Telegram when an order is placed or flagged high-risk, and
only once the order has actually been committed."""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

import pytest

from apps.business.selectors.business_profile import get_currency_symbol
from apps.orders.constants import PaymentMethodKey
from apps.orders.factories import SalesOrderFactory
from apps.orders.services.notifications import alert_order_placed
from apps.risk.services.scoring import assess_order_risk

from .test_unpaid_orders import _cod_order

pytestmark = pytest.mark.django_db

SEND = "apps.common.services.telegram.send_telegram"


def test_placing_an_order_alerts_staff_after_commit(django_capture_on_commit_callbacks):
    with patch(SEND) as send, django_capture_on_commit_callbacks(execute=True):
        order, _ = _cod_order("alert-cod@example.com")
        send.assert_not_called()  # nothing is sent inside the transaction

    text = send.call_args.kwargs["text"]
    assert order.order_number in text
    assert f"{order.grand_total:,.2f}" in text
    assert "Cash on delivery" in text
    assert send.call_count == 1


def test_the_order_alert_adds_no_query(django_assert_num_queries):
    order, _ = _cod_order("alert-queries@example.com")
    get_currency_symbol()  # cached after the first read

    with django_assert_num_queries(0):
        alert_order_placed(order, method=PaymentMethodKey.COD)


def test_a_high_risk_order_alerts_staff_with_its_case(django_capture_on_commit_callbacks):
    order = SalesOrderFactory(grand_total=Decimal("100000.00"))

    with patch(SEND) as send, django_capture_on_commit_callbacks(execute=True):
        assessment = assess_order_risk(order=order)

    text = send.call_args.kwargs["text"]
    assert order.order_number in text
    assert assessment.fraud_cases.get().case_number in text


def test_a_low_risk_order_sends_no_risk_alert(django_capture_on_commit_callbacks):
    order = SalesOrderFactory(grand_total=Decimal("100.00"))

    with patch(SEND) as send, django_capture_on_commit_callbacks(execute=True):
        assess_order_risk(order=order)

    send.assert_not_called()
