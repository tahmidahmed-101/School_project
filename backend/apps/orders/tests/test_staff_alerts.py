"""Linked staff hear on Telegram when an order is placed or flagged high-risk,
in their own private chat, and only once the order has been committed."""

from __future__ import annotations

from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.factories import StaffPermissionFactory
from apps.accounts.models import TelegramLink
from apps.accounts.tests.helpers import create_user
from apps.business.selectors.business_profile import get_currency_symbol
from apps.orders.constants import PaymentMethodKey
from apps.orders.factories import SalesOrderFactory
from apps.orders.models import SalesOrder
from apps.orders.services.notifications import alert_order_placed
from apps.orders.services.payments import record_payment_due
from apps.orders.services.telegram_bot import send_order_alert
from apps.risk.services.scoring import assess_order_risk

from .test_api import _reserved_order
from .test_unpaid_orders import _cod_order

pytestmark = pytest.mark.django_db


def _link(telegram_user_id: int, *codes: str):
    """A linked staff member, or a linked admin when no permission is given."""
    email = f"alert-staff-{telegram_user_id}@example.com"
    user = create_user(email=email, role=UserRole.STAFF if codes else UserRole.ADMIN)
    for code in codes:
        StaffPermissionFactory(user=user, permission_code=code)
    TelegramLink.objects.create(user=user, telegram_user_id=telegram_user_id)
    return user


def _buttons(payload: dict) -> list[str]:
    rows = payload.get("reply_markup", {}).get("inline_keyboard", [])
    return [button["callback_data"].split(":")[0] for row in rows for button in row]


def test_placing_a_cod_order_alerts_linked_staff_after_commit(
    telegram_outbox, django_capture_on_commit_callbacks
):
    _link(11)
    _link(12, StaffPermissionCode.ORDERS_VIEW)
    _link(13, StaffPermissionCode.USERS_VIEW)  # no order permission: not told

    with django_capture_on_commit_callbacks(execute=True):
        order, _ = _cod_order("alert-cod@example.com")
        assert telegram_outbox == []  # nothing is sent inside the transaction

    assert sorted(payload["chat_id"] for _, payload in telegram_outbox) == [11, 12]
    payload = telegram_outbox[0][1]
    assert order.order_number in payload["text"]
    assert f"{order.grand_total:,.2f}" in payload["text"]
    assert "Cash on delivery" in payload["text"]
    # A COD order is confirmed when placed, so there is nothing to confirm.
    assert _buttons(payload) == ["cod", "cancel"]


def test_an_order_awaiting_payment_offers_confirm_and_a_preorder_does_not(telegram_outbox):
    _link(11)
    order, _ = _reserved_order("alert-awaiting@example.com")

    send_order_alert(order, "placed")
    assert _buttons(telegram_outbox[-1][1]) == ["confirm", "cancel"]

    SalesOrder.objects.filter(pk=order.pk).update(order_type=SalesOrder.OrderType.PREORDER)
    order.refresh_from_db()
    send_order_alert(order, "placed")
    assert _buttons(telegram_outbox[-1][1]) == ["cancel"]


def test_nothing_is_sent_when_no_staff_member_is_linked(
    telegram_outbox, django_capture_on_commit_callbacks
):
    with django_capture_on_commit_callbacks(execute=True):
        _cod_order("alert-nobody@example.com")

    assert telegram_outbox == []


def test_a_telegram_outage_does_not_fail_the_order(settings, django_capture_on_commit_callbacks):
    import urllib.error
    from unittest.mock import patch

    settings.TELEGRAM_BOT_TOKEN = "test-token"
    _link(11)
    down = patch(
        "apps.common.services.telegram.urllib.request.urlopen",
        side_effect=urllib.error.URLError("down"),
    )

    with down, django_capture_on_commit_callbacks(execute=True):
        order, _ = _cod_order("alert-outage@example.com")

    assert SalesOrder.objects.get(pk=order.pk).status == SalesOrder.Status.CONFIRMED


def test_the_order_alert_adds_no_query_to_the_checkout(django_assert_num_queries):
    order, _ = _cod_order("alert-queries@example.com")
    get_currency_symbol()  # cached after the first read

    with django_assert_num_queries(0):
        alert_order_placed(order, method=PaymentMethodKey.COD)


def test_sending_the_alert_costs_the_same_however_many_staff_are_linked(telegram_outbox):
    order, _ = _cod_order("alert-growth@example.com")

    def queries_to_alert() -> int:
        with CaptureQueriesContext(connection) as captured:
            send_order_alert(SalesOrder.objects.get(pk=order.pk), "placed")
        return len(captured)

    _link(11)
    with_one = queries_to_alert()
    for telegram_user_id in range(12, 20):
        _link(telegram_user_id, StaffPermissionCode.ORDERS_MANAGE)

    assert queries_to_alert() == with_one
    assert len(telegram_outbox) == 1 + 9


def test_a_possible_duplicate_is_flagged_without_touching_either_order(telegram_outbox):
    _link(11)
    first, variant = _reserved_order("dup-first@example.com", quantity=2)
    second, _ = _reserved_order("dup-second@example.com", quantity=2)
    second.lines.update(variant=variant)
    # The same number, typed two ways.
    SalesOrder.objects.filter(pk=first.pk).update(contact_phone="01711223344")
    SalesOrder.objects.filter(pk=second.pk).update(contact_phone="+8801711223344")
    second.refresh_from_db()

    record_payment_due(order=second, method=PaymentMethodKey.COD)  # placing is not blocked
    send_order_alert(second, "placed")

    assert f"Possible duplicate of {first.order_number}" in telegram_outbox[-1][1]["text"]
    assert SalesOrder.objects.get(pk=first.pk).status == SalesOrder.Status.AWAITING_PAYMENT
    assert SalesOrder.objects.get(pk=second.pk).status == SalesOrder.Status.CONFIRMED


@pytest.mark.parametrize(
    "change",
    [
        {"contact_phone": "01999999999"},  # another phone
        {"status": SalesOrder.Status.CANCELLED},  # the earlier order is no longer open
    ],
)
def test_a_different_phone_or_a_closed_order_is_not_a_duplicate(telegram_outbox, change):
    _link(11)
    first, variant = _reserved_order("nodup-first@example.com", quantity=2)
    second, _ = _reserved_order("nodup-second@example.com", quantity=2)
    second.lines.update(variant=variant)
    SalesOrder.objects.filter(pk__in=[first.pk, second.pk]).update(contact_phone="01711223344")
    SalesOrder.objects.filter(pk=first.pk).update(**change)
    second.refresh_from_db()

    send_order_alert(second, "placed")

    assert "duplicate" not in telegram_outbox[-1][1]["text"]


def test_different_quantities_are_not_a_duplicate(telegram_outbox):
    _link(11)
    first, variant = _reserved_order("qty-first@example.com", quantity=2)
    second, _ = _reserved_order("qty-second@example.com", quantity=3)
    second.lines.update(variant=variant)
    SalesOrder.objects.filter(pk__in=[first.pk, second.pk]).update(contact_phone="01711223344")
    second.refresh_from_db()

    send_order_alert(second, "placed")

    assert "duplicate" not in telegram_outbox[-1][1]["text"]


def test_a_high_risk_order_alerts_linked_staff_with_its_case(
    telegram_outbox, django_capture_on_commit_callbacks
):
    _link(11)
    order = SalesOrderFactory(grand_total=Decimal("100000.00"))

    with django_capture_on_commit_callbacks(execute=True):
        assessment = assess_order_risk(order=order)

    text = telegram_outbox[0][1]["text"]
    assert order.order_number in text
    assert assessment.fraud_cases.get().case_number in text


def test_a_low_risk_order_sends_no_risk_alert(telegram_outbox, django_capture_on_commit_callbacks):
    _link(11)
    order = SalesOrderFactory(grand_total=Decimal("100.00"))

    with django_capture_on_commit_callbacks(execute=True):
        assess_order_risk(order=order)

    assert telegram_outbox == []
