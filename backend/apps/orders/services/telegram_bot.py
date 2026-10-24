"""The staff Telegram bot: order alerts, read-only commands and the few order
actions that are safe as one tap.

Nothing here writes to an order itself. Every action reloads the order and
goes through the same service the dashboard calls, after re-checking who is
asking. Callback data only names the action and the order; it is never taken
as proof of who the sender is or what state the order is in.
"""

from __future__ import annotations

import re
from uuid import UUID

from django.core.cache import cache
from django.utils import timezone
from django.utils.timesince import timesince

from apps.accounts.constants import StaffPermissionCode
from apps.accounts.selectors.telegram_links import get_linked_staff
from apps.accounts.services.telegram_links import link_telegram_account, send_to_staff
from apps.audit.services.audit import log_action
from apps.business.selectors.business_profile import get_currency_symbol
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.permissions import user_has_any_staff_permission
from apps.common.services.telegram import call_telegram, send_telegram
from apps.orders.constants import PAYMENT_METHODS_BY_KEY, PaymentMethodKey
from apps.orders.models import Payment, SalesOrder
from apps.orders.selectors.payments import order_balance_due
from apps.orders.selectors.sales_orders import (
    customer_carts_list,
    get_order_by_number,
    orders_awaiting_payment,
    orders_today_summary,
    possible_duplicate_orders,
)
from apps.orders.services.notifications import order_label
from apps.orders.services.orders import cancel_order, set_order_status
from apps.orders.services.payments import record_cod_verification

READ = (StaffPermissionCode.ORDERS_VIEW, StaffPermissionCode.ORDERS_MANAGE)
MANAGE = (StaffPermissionCode.ORDERS_MANAGE,)

ORDER_NUMBER = re.compile(r"^(SO|PRE)-[0-9]{9}$")
PAGE_SIZE = 10
MESSAGES_PER_MINUTE = 30
LINK_ATTEMPTS = 5
LINK_ATTEMPT_WINDOW_SECONDS = 15 * 60
CANCEL_CONFIRM_SECONDS = 120
# Telegram retries an update it did not get a 200 for; each is applied once.
UPDATE_MEMORY_SECONDS = 24 * 60 * 60

NOT_LINKED = (
    "This bot is for shop staff. Open your profile in the dashboard, generate a "
    "Telegram code, and send it here as: /start CODE"
)
HELP = (
    "/today — today's numbers\n"
    "/pending — orders awaiting payment\n"
    "/order SO-123456789 — look up an order"
)


def _money(amount) -> str:
    return f"{get_currency_symbol()}{amount:,.2f}"


def _within_limit(key: str, limit: int, seconds: int) -> bool:
    cache.add(key, 0, seconds)
    try:
        return cache.incr(key) <= limit
    except ValueError:  # the key expired between the two calls
        return True


# Which actions an order is open to ---------------------------------------------


def _has_cod_due(order: SalesOrder) -> bool:
    return any(
        payment.method == PaymentMethodKey.COD and payment.status == Payment.Status.PENDING
        for payment in order.payments.all()
    )


def can_confirm(order: SalesOrder) -> bool:
    """Only a stock order waiting for its payment. A cash-on-delivery order is
    confirmed when it is placed, and a pre-order waits for its deposit, which
    one tap must not wave through."""
    return (
        order.status == SalesOrder.Status.AWAITING_PAYMENT
        and order.order_type == SalesOrder.OrderType.STOCK
    )


def can_cancel(order: SalesOrder) -> bool:
    return order.status in (SalesOrder.Status.AWAITING_PAYMENT, SalesOrder.Status.CONFIRMED)


def can_verify_cod(order: SalesOrder) -> bool:
    return can_cancel(order) and order.cod_verified_at is None and _has_cod_due(order)


def order_keyboard(order: SalesOrder) -> dict | None:
    buttons = []
    if can_confirm(order):
        buttons.append({"text": "✅ Confirm (unpaid)", "callback_data": f"confirm:{order.id}"})
    if can_verify_cod(order):
        buttons.append({"text": "📞 COD verified", "callback_data": f"cod:{order.id}"})
    if can_cancel(order):
        buttons.append({"text": "✖ Cancel", "callback_data": f"cancel:{order.id}"})
    return {"inline_keyboard": [buttons]} if buttons else None


def _duplicate_warning(order: SalesOrder) -> str:
    duplicates = possible_duplicate_orders(order)
    if not duplicates:
        return ""
    numbers = ", ".join(other.order_number for other in duplicates[:3])
    return f"\n⚠️ Possible duplicate of {numbers} (same phone and items). Nothing was changed."


# Alerts ------------------------------------------------------------------------


def send_order_alert(order: SalesOrder, text: str) -> None:
    """The new-order alert, sent after the order committed. The number of
    queries does not depend on how many staff are linked."""
    send_to_staff(
        text + _duplicate_warning(order), permissions=READ, reply_markup=order_keyboard(order)
    )


# Commands ----------------------------------------------------------------------


def _order_summary(order: SalesOrder) -> str:
    lines = [
        order_label(order),
        f"Status: {order.get_status_display()}",
        f"Total: {_money(order.grand_total)} · Due: {_money(order_balance_due(order))}",
    ]
    payments = [
        f"{PAYMENT_METHODS_BY_KEY[payment.method].label} ({payment.get_status_display().lower()})"
        for payment in order.payments.all()
    ]
    lines.append(f"Payment: {', '.join(payments) or 'none recorded'}")
    if _has_cod_due(order):
        lines.append(f"COD verified: {'yes' if order.cod_verified_at else 'not yet'}")
    order_lines = list(order.lines.all())
    shipped = sum(line.shipped_quantity for line in order_lines)
    lines.append(f"Shipped: {shipped} of {sum(line.quantity for line in order_lines)}")
    return "\n".join(lines)


def _today() -> str:
    counts = orders_today_summary()
    return (
        f"Today, {timezone.localdate():%d %b}\n"
        f"New orders: {counts['new_today']}\n"
        f"Awaiting payment: {counts['awaiting_payment']}\n"
        f"Awaiting shipment: {counts['awaiting_shipment']}"
    )


def _pending(arg: str) -> str:
    page = int(arg) if arg.isdigit() and int(arg) > 0 else 1
    orders = orders_awaiting_payment()
    total = orders.count()
    rows = []
    for order in orders[(page - 1) * PAGE_SIZE : page * PAGE_SIZE]:
        payment = next(iter(order.payments.all()), None)
        method = PAYMENT_METHODS_BY_KEY[payment.method].label if payment else "no method"
        rows.append(
            f"{order.order_number} · {_money(order.grand_total)} · {method} · "
            f"{timesince(order.created_at)} ago"
        )
    text = f"Awaiting payment: {total}\n" + ("\n".join(rows) or "Nothing on this page.")
    if total > page * PAGE_SIZE:
        text += f"\nMore: /pending {page + 1}"
    # A "pending" order is a cart that was never placed, so it is only counted.
    return text + f"\nOpen carts (not placed): {customer_carts_list().count()}"


def _lookup(staff, sender: int, raw: str) -> None:
    number = raw.strip().upper()
    if not ORDER_NUMBER.match(number):
        send_telegram(chat_id=sender, text="Send an order number like SO-123456789.")
        return
    order = get_order_by_number(number)
    if order is None:
        send_telegram(chat_id=sender, text="No order with that number.")
        return
    may_act = user_has_any_staff_permission(staff, MANAGE)
    send_telegram(
        chat_id=sender,
        text=_order_summary(order) + _duplicate_warning(order),
        reply_markup=order_keyboard(order) if may_act else None,
    )


def _link(sender: int, code: str) -> None:
    attempts_key = f"telegram:link_attempts:{sender}"
    if cache.get(attempts_key, 0) >= LINK_ATTEMPTS:
        send_telegram(chat_id=sender, text="Too many wrong codes. Try again in 15 minutes.")
        return
    try:
        link_telegram_account(code=code, telegram_user_id=sender)
    except BusinessRuleViolationError as exc:
        _within_limit(attempts_key, LINK_ATTEMPTS, LINK_ATTEMPT_WINDOW_SECONDS)
        send_telegram(chat_id=sender, text=exc.message)
        return
    send_telegram(chat_id=sender, text=f"Linked. You will get order alerts here.\n{HELP}")


def _handle_message(message: dict) -> None:
    chat = message.get("chat") or {}
    sender = (message.get("from") or {}).get("id")
    # Order details only ever go to the person's own private chat.
    if sender is None or chat.get("type") != "private" or chat.get("id") != sender:
        return
    text = (message.get("text") or "").strip()
    command, _, arg = text.partition(" ")
    command, arg = command.split("@")[0].lower(), arg.strip()

    if command in ("/start", "/link") and arg:
        _link(sender, arg)
        return
    if not _within_limit(f"telegram:messages:{sender}", MESSAGES_PER_MINUTE, 60):
        send_telegram(chat_id=sender, text="Too many requests. Try again in a minute.")
        return
    staff = get_linked_staff(sender)
    if staff is None:
        send_telegram(chat_id=sender, text=NOT_LINKED)
        return
    if not user_has_any_staff_permission(staff, READ):
        send_telegram(chat_id=sender, text="Your account does not have permission to view orders.")
        return

    if command == "/today":
        send_telegram(chat_id=sender, text=_today())
    elif command == "/pending":
        send_telegram(chat_id=sender, text=_pending(arg))
    elif command == "/order":
        _lookup(staff, sender, arg)
    elif ORDER_NUMBER.match(text.upper()):
        _lookup(staff, sender, text)
    else:
        send_telegram(chat_id=sender, text=HELP)


# Button presses ----------------------------------------------------------------


def _cancel_key(sender: int, order: SalesOrder) -> str:
    return f"telegram:cancel:{sender}:{order.id}"


def _confirm(order: SalesOrder, staff, _sender: int) -> str:
    if not can_confirm(order):
        return f"It is {order.get_status_display().lower()} and cannot be confirmed here."
    set_order_status(order=order, new_status=SalesOrder.Status.CONFIRMED, actor=staff)
    due = _money(order_balance_due(order))
    return f"Confirmed by hand. No payment is recorded: {due} is still due."


def _verify_cod(order: SalesOrder, staff, _sender: int) -> str:
    record_cod_verification(order=order, actor=staff)
    return "COD verified. The payment stays pending until the cash is collected."


def _ask_cancel(order: SalesOrder, _staff, sender: int) -> str:
    if not can_cancel(order):
        return f"It is {order.get_status_display().lower()} and cannot be cancelled here."
    cache.set(_cancel_key(sender, order), 1, CANCEL_CONFIRM_SECONDS)
    send_telegram(
        chat_id=sender,
        text=(
            f"Cancel {order_label(order)} ({_money(order.grand_total)})?\n"
            "Its stock is released. No refund is made."
        ),
        reply_markup={
            "inline_keyboard": [
                [
                    {"text": "Yes, cancel it", "callback_data": f"cancel_yes:{order.id}"},
                    {"text": "Keep it", "callback_data": f"cancel_no:{order.id}"},
                ]
            ]
        },
    )
    return "Confirm the cancellation in the next message."


def _cancel(order: SalesOrder, staff, sender: int) -> str:
    # Deleting the key is what makes the confirmation single-use: a repeated or
    # replayed press finds nothing to delete.
    if not cache.delete(_cancel_key(sender, order)):
        return "That confirmation has expired or was already used. Tap Cancel again."
    cancel_order(order=order, actor=staff)
    log_action(
        actor=staff,
        action="order.cancelled",
        target_type="SalesOrder",
        target_id=order.id,
        metadata={"via": "telegram"},
    )
    return "Cancelled. Its stock is released; no refund is made."


def _keep(order: SalesOrder, _staff, sender: int) -> str:
    cache.delete(_cancel_key(sender, order))
    return "Kept. Nothing was changed."


ACTIONS = {
    "confirm": _confirm,
    "cod": _verify_cod,
    "cancel": _ask_cancel,
    "cancel_yes": _cancel,
    "cancel_no": _keep,
}


def _order_for_action(raw_id: str) -> SalesOrder | None:
    try:
        order_id = UUID(raw_id)
    except ValueError:
        return None
    return (
        SalesOrder.objects.filter(pk=order_id, deleted_at__isnull=True)
        .exclude(status=SalesOrder.Status.PENDING)
        .prefetch_related("payments")
        .first()
    )


def _handle_callback(callback: dict) -> None:
    sender = (callback.get("from") or {}).get("id")
    message = callback.get("message") or {}
    chat = message.get("chat") or {}
    if sender is None or chat.get("type") != "private" or chat.get("id") != sender:
        return

    def answer(text: str) -> None:
        call_telegram(
            "answerCallbackQuery", {"callback_query_id": callback.get("id"), "text": text[:200]}
        )

    if not _within_limit(f"telegram:messages:{sender}", MESSAGES_PER_MINUTE, 60):
        answer("Too many requests. Try again in a minute.")
        return
    staff = get_linked_staff(sender)
    if staff is None or not user_has_any_staff_permission(staff, MANAGE):
        answer("You are not allowed to do this.")
        return
    action, _, raw_id = (callback.get("data") or "").partition(":")
    order = _order_for_action(raw_id) if action in ACTIONS else None
    if order is None:
        answer("This button is no longer valid.")
        return

    try:
        result = ACTIONS[action](order, staff, sender)
    except BusinessRuleViolationError as exc:
        result = exc.message
    answer(result)
    send_telegram(chat_id=sender, text=f"{order_label(order)}: {result}")
    # Redraw the pressed message's buttons from the order as it now stands.
    fresh = _order_for_action(raw_id)
    keyboard = order_keyboard(fresh) if fresh and action in ("confirm", "cod", "cancel") else None
    call_telegram(
        "editMessageReplyMarkup",
        {
            "chat_id": sender,
            "message_id": message.get("message_id"),
            "reply_markup": keyboard or {"inline_keyboard": []},
        },
    )


def handle_update(update: dict) -> None:
    update_id = update.get("update_id")
    if update_id is not None and not cache.add(
        f"telegram:update:{update_id}", 1, UPDATE_MEMORY_SECONDS
    ):
        return
    if update.get("callback_query"):
        _handle_callback(update["callback_query"])
    elif update.get("message"):
        _handle_message(update["message"])
