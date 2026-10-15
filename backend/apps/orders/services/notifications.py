from __future__ import annotations

from django.db import transaction

from apps.accounts.models import Notification
from apps.accounts.services.notifications import notify
from apps.business.selectors.business_profile import get_currency_symbol
from apps.orders.constants import PAYMENT_METHODS_BY_KEY
from apps.orders.models import ReturnRMA, SalesOrder


def order_label(order: SalesOrder) -> str:
    noun = "Pre-order" if order.order_type == SalesOrder.OrderType.PREORDER else "Order"
    return f"{noun} {order.order_number}"


def notify_order(order: SalesOrder, title: str) -> None:
    notify(user=order.customer, kind=Notification.Kind.ORDER, title=title, object_id=order.id)


def notify_return(rma: ReturnRMA, title: str) -> None:
    notify(user=rma.order.customer, kind=Notification.Kind.RETURN, title=title, object_id=rma.id)


def alert_order_placed(order: SalesOrder, *, method: str) -> None:
    """Tell linked staff on Telegram that an order was placed. The message is
    built from what the caller already loaded, and everything else waits for
    the commit, so this adds no query to the checkout."""
    text = (
        f"🛒 {order_label(order)} placed\n"
        f"Total: {get_currency_symbol()}{order.grand_total:,.2f}\n"
        f"Payment: {PAYMENT_METHODS_BY_KEY[method].label}"
    )

    def send() -> None:
        from apps.orders.services.telegram_bot import send_order_alert

        send_order_alert(order, text)

    transaction.on_commit(send, robust=True)
