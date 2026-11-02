"""The staff Telegram bot: who may talk to it, what the commands answer, and
that every button goes through the order services after re-checking the
sender and the order."""

from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.factories import StaffPermissionFactory
from apps.accounts.models import StaffPermission, TelegramLink
from apps.accounts.services.telegram_links import create_telegram_link_code
from apps.accounts.tests.helpers import create_user
from apps.audit.models import AuditLog
from apps.inventory.selectors.stock import get_stock_item
from apps.orders.models import Payment, SalesOrder
from apps.orders.services.orders import cancel_order
from apps.orders.services.telegram_bot import PAGE_SIZE, handle_update

from .test_api import _reserved_order
from .test_unpaid_orders import _cod_order

pytestmark = pytest.mark.django_db

WEBHOOK = "/api/v1/webhooks/telegram/"
SENDER = 4242


def _staff(*codes: str, telegram_user_id: int = SENDER, **fields):
    """A linked staff member, or a linked admin when no permission is given."""
    email = f"bot-staff-{telegram_user_id}@example.com"
    user = create_user(email=email, role=UserRole.STAFF if codes else UserRole.ADMIN, **fields)
    for code in codes:
        StaffPermissionFactory(user=user, permission_code=code)
    TelegramLink.objects.create(user=user, telegram_user_id=telegram_user_id)
    return user


def _say(text: str, sender: int = SENDER, **extra) -> None:
    handle_update(
        {
            "message": {
                "from": {"id": sender},
                "chat": {"id": sender, "type": "private"},
                "text": text,
            },
            **extra,
        }
    )


def _tap(action: str, order, sender: int = SENDER, **extra) -> None:
    handle_update(
        {
            "callback_query": {
                "id": "cb",
                "from": {"id": sender},
                "data": f"{action}:{getattr(order, 'id', order)}",
                "message": {"message_id": 9, "chat": {"id": sender, "type": "private"}},
            },
            **extra,
        }
    )


def _texts(outbox) -> list[str]:
    return [payload["text"] for method, payload in outbox if method == "sendMessage"]


def _status(order) -> str:
    return SalesOrder.objects.get(pk=order.pk).status


# Webhook -----------------------------------------------------------------------


def test_webhook_refuses_a_missing_or_wrong_secret(api_client, settings, telegram_outbox):
    settings.TELEGRAM_WEBHOOK_SECRET = "right-secret"
    _staff()
    update = {"message": {"from": {"id": SENDER}, "chat": {"id": SENDER, "type": "private"}}}

    assert api_client.post(WEBHOOK, update, format="json").status_code == 403
    wrong = api_client.post(
        WEBHOOK, update, format="json", HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN="wrong"
    )
    assert wrong.status_code == 403
    assert telegram_outbox == []


def test_webhook_is_closed_while_no_secret_is_configured(api_client, settings):
    settings.TELEGRAM_WEBHOOK_SECRET = ""

    response = api_client.post(WEBHOOK, {}, format="json", HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN="")

    assert response.status_code == 403


def test_webhook_handles_an_update_carrying_the_secret(api_client, settings, telegram_outbox):
    settings.TELEGRAM_WEBHOOK_SECRET = "right-secret"
    _staff()

    response = api_client.post(
        WEBHOOK,
        {
            "update_id": 1,
            "message": {
                "from": {"id": SENDER},
                "chat": {"id": SENDER, "type": "private"},
                "text": "/today",
            },
        },
        format="json",
        HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN="right-secret",
    )

    assert response.status_code == 200
    assert "New orders" in _texts(telegram_outbox)[0]


# Who may use it ----------------------------------------------------------------


def test_an_unlinked_account_learns_nothing(telegram_outbox):
    order, _ = _cod_order("bot-unlinked@example.com")

    _say(order.order_number)
    _say("/today")
    _tap("cancel", order)

    assert all(order.order_number not in text for text in _texts(telegram_outbox))
    assert "This bot is for shop staff" in _texts(telegram_outbox)[0]
    assert _status(order) == SalesOrder.Status.CONFIRMED


def test_a_deactivated_staff_member_is_treated_as_unlinked(telegram_outbox):
    staff = _staff(StaffPermissionCode.ORDERS_MANAGE)
    order, _ = _cod_order("bot-inactive@example.com")
    staff.is_active = False
    staff.save(update_fields=["is_active"])

    _say(order.order_number)
    _tap("cancel_yes", order)

    assert "This bot is for shop staff" in _texts(telegram_outbox)[0]
    assert _status(order) == SalesOrder.Status.CONFIRMED


def test_a_revoked_permission_takes_effect_on_the_next_message(telegram_outbox):
    staff = _staff(StaffPermissionCode.ORDERS_MANAGE)
    order, _ = _cod_order("bot-revoked@example.com")
    _say(order.order_number)
    assert order.order_number in _texts(telegram_outbox)[-1]

    StaffPermission.objects.filter(user=staff).update(is_enabled=False)
    _say(order.order_number)
    _tap("cancel", order)

    assert "does not have permission" in _texts(telegram_outbox)[-1]
    assert _status(order) == SalesOrder.Status.CONFIRMED


def test_view_only_staff_can_look_up_but_not_act(telegram_outbox):
    _staff(StaffPermissionCode.ORDERS_VIEW)
    order, _ = _cod_order("bot-viewer@example.com")

    _say(f"/order {order.order_number.lower()}")
    lookup = telegram_outbox[-1][1]
    assert order.order_number in lookup["text"]
    assert "reply_markup" not in lookup  # no buttons for someone who cannot act

    _tap("cancel", order)
    assert ("answerCallbackQuery", "You are not allowed to do this.") in [
        (method, payload.get("text")) for method, payload in telegram_outbox
    ]
    assert _status(order) == SalesOrder.Status.CONFIRMED


def test_messages_in_a_group_are_ignored(telegram_outbox):
    _staff()
    group = {"id": -100, "type": "group"}
    handle_update({"message": {"from": {"id": SENDER}, "chat": group, "text": "/today"}})

    assert telegram_outbox == []


def test_too_many_messages_in_a_minute_are_refused(telegram_outbox):
    _staff()

    for _ in range(31):
        _say("/today")

    assert "Too many requests" in _texts(telegram_outbox)[-1]
    assert sum("New orders" in text for text in _texts(telegram_outbox)) == 30


# Linking -----------------------------------------------------------------------


def test_start_with_a_code_links_the_account(telegram_outbox):
    staff = create_user(email="bot-link@example.com", role=UserRole.ADMIN)
    code = create_telegram_link_code(user=staff)

    _say(f"/start {code}")

    assert TelegramLink.objects.get(user=staff).telegram_user_id == SENDER
    assert "Linked" in _texts(telegram_outbox)[0]
    assert code not in str(AuditLog.objects.values_list("metadata", flat=True))


def test_wrong_codes_lock_linking_out_even_for_the_right_code(telegram_outbox):
    staff = create_user(email="bot-brute@example.com", role=UserRole.ADMIN)
    code = create_telegram_link_code(user=staff)

    for guess in range(5):
        _say(f"/start WRONGCODE{guess}")
    _say(f"/start {code}")

    assert "Too many wrong codes" in _texts(telegram_outbox)[-1]
    assert not TelegramLink.objects.exists()


# Commands ----------------------------------------------------------------------


def test_today_counts_placed_orders_by_stage(telegram_outbox):
    _staff()
    _cod_order("today-confirmed@example.com")  # confirmed, so awaiting shipment
    _reserved_order("today-awaiting@example.com")
    cancelled, _ = _reserved_order("today-cancelled@example.com")
    cancel_order(order=cancelled)

    _say("/today")

    text = _texts(telegram_outbox)[-1]
    assert "New orders: 3" in text
    assert "Awaiting payment: 1" in text
    assert "Awaiting shipment: 1" in text


def test_pending_lists_one_page_and_points_at_the_next(telegram_outbox):
    _staff()
    for index in range(PAGE_SIZE + 2):
        _reserved_order(f"pending-{index}@example.com", quantity=1)

    _say("/pending")
    first = _texts(telegram_outbox)[-1]
    assert f"Awaiting payment: {PAGE_SIZE + 2}" in first
    assert first.count("SO-") == PAGE_SIZE
    assert "/pending 2" in first

    _say("/pending 2")
    assert _texts(telegram_outbox)[-1].count("SO-") == 2


def test_pending_costs_the_same_for_one_order_as_for_a_page(telegram_outbox):
    _staff()

    def queries() -> int:
        with CaptureQueriesContext(connection) as captured:
            _say("/pending")
        return len(captured)

    _reserved_order("growth-0@example.com", quantity=1)
    queries()  # the first call also fills the currency-symbol cache
    with_one = queries()
    for index in range(1, 8):
        _reserved_order(f"growth-{index}@example.com", quantity=1)

    assert queries() == with_one


def test_lookup_shows_the_minimum_and_never_contact_details(telegram_outbox):
    _staff()
    order, _ = _cod_order("lookup-private@example.com")
    SalesOrder.objects.filter(pk=order.pk).update(contact_phone="01711223344")

    _say(order.order_number)

    text = _texts(telegram_outbox)[-1]
    assert "Status: Confirmed" in text
    assert f"Due: ৳{order.grand_total:,.2f}" in text
    assert "Cash on delivery (pending)" in text
    assert "COD verified: not yet" in text
    assert "01711223344" not in text
    assert "lookup-private@example.com" not in text


def test_lookup_rejects_a_malformed_or_unknown_number(telegram_outbox):
    _staff()

    _say("/order 1; DROP TABLE")
    assert "Send an order number like" in _texts(telegram_outbox)[-1]

    _say("/order SO-000000000")
    assert "No order with that number" in _texts(telegram_outbox)[-1]


# Buttons -----------------------------------------------------------------------


def test_confirm_goes_through_the_order_service_and_records_no_payment(telegram_outbox):
    staff = _staff()
    order, variant = _reserved_order("tap-confirm@example.com")

    _tap("confirm", order)

    assert _status(order) == SalesOrder.Status.CONFIRMED
    assert get_stock_item(variant=variant).quantity_reserved == 3  # the hold is kept
    assert not Payment.objects.filter(order=order, status=Payment.Status.CAPTURED).exists()
    assert "No payment is recorded" in _texts(telegram_outbox)[-1]
    assert AuditLog.objects.filter(action="order.status_overridden", actor=staff).exists()


def test_confirm_is_refused_for_an_order_that_is_not_awaiting_payment(telegram_outbox):
    _staff()
    order, _ = _cod_order("tap-confirm-stale@example.com")
    cancel_order(order=order)

    _tap("confirm", order)

    assert _status(order) == SalesOrder.Status.CANCELLED
    assert "cannot be confirmed here" in _texts(telegram_outbox)[-1]


def test_confirm_is_not_offered_or_applied_to_a_preorder_waiting_for_its_deposit(telegram_outbox):
    _staff()
    order, _ = _reserved_order("tap-confirm-preorder@example.com")
    SalesOrder.objects.filter(pk=order.pk).update(order_type=SalesOrder.OrderType.PREORDER)

    _tap("confirm", order)

    assert _status(order) == SalesOrder.Status.AWAITING_PAYMENT


def test_cod_verification_marks_the_order_and_leaves_the_payment_pending(telegram_outbox):
    staff = _staff()
    order, _ = _cod_order("tap-cod@example.com")

    _tap("cod", order)

    order.refresh_from_db()
    assert order.cod_verified_at is not None
    assert order.cod_verified_by == staff
    assert order.status == SalesOrder.Status.CONFIRMED
    payment = Payment.objects.get(order=order)
    assert payment.status == Payment.Status.PENDING
    assert AuditLog.objects.filter(action="order.cod_verified", actor=staff).exists()

    _tap("cod", order)  # a second press changes nothing
    assert "already verified" in _texts(telegram_outbox)[-1]


def test_cod_verification_is_refused_for_an_order_that_is_not_cash_on_delivery(telegram_outbox):
    _staff()
    order, _ = _reserved_order("tap-cod-not-cod@example.com")

    _tap("cod", order)

    order.refresh_from_db()
    assert order.cod_verified_at is None
    assert "no cash on delivery payment" in _texts(telegram_outbox)[-1]


def test_cancel_asks_first_and_only_the_second_step_cancels(telegram_outbox):
    staff = _staff()
    order, variant = _cod_order("tap-cancel@example.com")

    _tap("cancel", order)
    assert _status(order) == SalesOrder.Status.CONFIRMED
    prompt = next(p for m, p in telegram_outbox if m == "sendMessage" and "reply_markup" in p)
    assert order.order_number in prompt["text"]

    _tap("cancel_yes", order)
    assert _status(order) == SalesOrder.Status.CANCELLED
    assert get_stock_item(variant=variant).quantity_reserved == 0
    assert Payment.objects.get(order=order).status == Payment.Status.FAILED
    assert AuditLog.objects.filter(action="order.cancelled", actor=staff).exists()


def test_the_final_cancel_step_cannot_be_sent_on_its_own_or_twice(telegram_outbox):
    _staff()
    order, _ = _cod_order("tap-cancel-replay@example.com")

    _tap("cancel_yes", order)  # crafted: the first step never happened
    assert _status(order) == SalesOrder.Status.CONFIRMED
    assert "expired or was already used" in _texts(telegram_outbox)[-1]

    _tap("cancel", order)
    _tap("cancel_yes", order)
    _tap("cancel_yes", order)  # repeated press
    assert "expired or was already used" in _texts(telegram_outbox)[-1]
    assert AuditLog.objects.filter(action="order.cancelled").count() == 1


def test_one_persons_cancel_confirmation_does_not_cover_another_person(telegram_outbox):
    _staff()
    _staff(telegram_user_id=5151)
    order, _ = _cod_order("tap-cancel-other@example.com")

    _tap("cancel", order)
    _tap("cancel_yes", order, sender=5151)

    assert _status(order) == SalesOrder.Status.CONFIRMED


def test_choosing_keep_withdraws_the_cancel_confirmation(telegram_outbox):
    _staff()
    order, _ = _cod_order("tap-cancel-keep@example.com")

    _tap("cancel", order)
    _tap("cancel_no", order)
    _tap("cancel_yes", order)

    assert _status(order) == SalesOrder.Status.CONFIRMED


def test_a_cancel_confirmed_after_the_order_shipped_is_refused(telegram_outbox):
    _staff()
    order, _ = _cod_order("tap-cancel-late@example.com")
    _tap("cancel", order)
    SalesOrder.objects.filter(pk=order.pk).update(status=SalesOrder.Status.SHIPPED)

    _tap("cancel_yes", order)

    assert _status(order) == SalesOrder.Status.SHIPPED
    assert "not shipped yet" in _texts(telegram_outbox)[-1]


@pytest.mark.parametrize(
    "data",
    ["confirm:not-a-uuid", "confirm", "", "delete:{id}", "ship:{id}", "confirm:{id}:extra"],
)
def test_tampered_callback_data_does_nothing(telegram_outbox, data):
    _staff()
    order, _ = _reserved_order("tap-tampered@example.com")
    action, _, target = data.replace("{id}", str(order.id)).partition(":")

    _tap(action, target)

    assert _status(order) == SalesOrder.Status.AWAITING_PAYMENT
    assert telegram_outbox[-1] == (
        "answerCallbackQuery",
        {"callback_query_id": "cb", "text": "This button is no longer valid."},
    )


def test_a_cart_cannot_be_acted_on_through_a_crafted_button(telegram_outbox):
    from apps.orders.factories import SalesOrderFactory

    _staff()
    cart = SalesOrderFactory(status=SalesOrder.Status.PENDING)

    _tap("confirm", cart)

    assert _status(cart) == SalesOrder.Status.PENDING


def test_an_update_telegram_delivers_twice_is_applied_once(telegram_outbox):
    _staff()
    order, _ = _cod_order("tap-retry@example.com")

    _tap("cod", order, update_id=77)
    sent = len(telegram_outbox)
    _tap("cod", order, update_id=77)

    assert len(telegram_outbox) == sent
    assert AuditLog.objects.filter(action="order.cod_verified").count() == 1
