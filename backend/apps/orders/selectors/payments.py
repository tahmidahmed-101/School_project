from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from django.db.models import QuerySet

from apps.common.utils.dates import day_after, day_start
from apps.orders.models import Payment


def order_paid_total(order) -> Decimal:
    """Money actually received for the order and not handed back. Reads
    `order.payments.all()` so a prefetched order costs no query."""
    paid = Decimal("0.00")
    for payment in order.payments.all():
        if payment.status in (Payment.Status.CAPTURED, Payment.Status.REFUNDED):
            paid += payment.amount - payment.refunded_amount
    return paid


def order_balance_due(order) -> Decimal:
    return max(order.grand_total - order_paid_total(order), Decimal("0.00"))


def payments_list(
    *,
    order=None,
    status: str | None = None,
    method: str | None = None,
    start: date | None = None,
    end: date | None = None,
    kind: str | None = None,
) -> QuerySet[Payment]:
    queryset = Payment.objects.select_related("order")
    if kind:
        queryset = queryset.filter(order__order_type=kind)
    if order is not None:
        queryset = queryset.filter(order=order)
    if status:
        queryset = queryset.filter(status=status)
    if method:
        queryset = queryset.filter(method=method)
    if start is not None:
        queryset = queryset.filter(created_at__gte=day_start(start))
    if end is not None:
        queryset = queryset.filter(created_at__lt=day_after(end))
    return queryset.order_by("-created_at")


def get_payment_by_id(payment_id: str | UUID) -> Payment | None:
    return Payment.objects.select_related("order").filter(id=payment_id).first()
