from __future__ import annotations

from datetime import date
from uuid import UUID

from django.db.models import QuerySet
from django.utils import timezone

from apps.common.utils.dates import day_start
from apps.orders.models import StockReservation


def reservations_list(
    *,
    variant=None,
    order=None,
    status: str | None = None,
    created_before: date | None = None,
    expired: bool | None = None,
) -> QuerySet[StockReservation]:
    queryset = StockReservation.objects.select_related(
        "order_line", "order_line__order", "variant__product"
    )
    if variant is not None:
        queryset = queryset.filter(variant=variant)
    if order is not None:
        queryset = queryset.filter(order_line__order=order)
    if status:
        queryset = queryset.filter(status=status)
    if created_before is not None:
        queryset = queryset.filter(created_at__lt=day_start(created_before))
    if expired is not None:
        now = timezone.now()
        queryset = (
            queryset.filter(status=StockReservation.Status.ACTIVE, expires_at__lte=now)
            if expired
            else queryset.exclude(status=StockReservation.Status.ACTIVE, expires_at__lte=now)
        )
    return queryset.order_by("-created_at")


def get_reservation_by_id(reservation_id: str | UUID) -> StockReservation | None:
    return reservations_list().filter(id=reservation_id).first()
