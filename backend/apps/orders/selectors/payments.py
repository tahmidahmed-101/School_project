from __future__ import annotations

from datetime import date
from uuid import UUID

from django.db.models import QuerySet

from apps.common.utils.dates import day_after, day_start
from apps.orders.models import Payment


def payments_list(
    *,
    order=None,
    status: str | None = None,
    method: str | None = None,
    start: date | None = None,
    end: date | None = None,
) -> QuerySet[Payment]:
    queryset = Payment.objects.select_related("order")
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
