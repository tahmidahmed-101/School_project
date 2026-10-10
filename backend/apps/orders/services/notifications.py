from __future__ import annotations

from apps.accounts.models import Notification
from apps.accounts.services.notifications import notify
from apps.business.selectors.business_profile import get_currency_symbol
from apps.common.services.telegram import alert_staff
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
    """Tell staff on Telegram that an order was placed. Reads only what the
    caller already loaded, so it adds no query to the checkout."""
    contact = order.contact_phone or order.contact_email
    alert_staff(
        f"🛒 {order_label(order)} placed\n"
        f"Total: {get_currency_symbol()}{order.grand_total:,.2f}\n"
        f"Payment: {PAYMENT_METHODS_BY_KEY[method].label}"
        + (f"\nContact: {contact}" if contact else "")
    )
