from __future__ import annotations

from apps.accounts.models import Notification
from apps.accounts.services.notifications import notify
from apps.orders.models import ReturnRMA, SalesOrder


def order_label(order: SalesOrder) -> str:
    noun = "Pre-order" if order.order_type == SalesOrder.OrderType.PREORDER else "Order"
    return f"{noun} {order.order_number}"


def notify_order(order: SalesOrder, title: str) -> None:
    notify(user=order.customer, kind=Notification.Kind.ORDER, title=title, object_id=order.id)


def notify_return(rma: ReturnRMA, title: str) -> None:
    notify(user=rma.order.customer, kind=Notification.Kind.RETURN, title=title, object_id=rma.id)
