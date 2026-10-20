from __future__ import annotations

from datetime import date
from uuid import UUID

from django.db.models import Q, QuerySet
from django.utils import timezone

from apps.common.utils.dates import day_start
from apps.orders.models import StockReservation


def reservations_list(
    *,
    variant=None,
    product=None,
    order=None,
    status: str | None = None,
    created_before: date | None = None,
    expired: bool | None = None,
    kind: str | None = None,
) -> QuerySet[StockReservation]:
    queryset = StockReservation.objects.select_related(
        "order_line", "order_line__order", "variant__product", "warehouse"
    )
    if variant is not None:
        queryset = queryset.filter(variant=variant)
    if product is not None:
        # A bundle's holds sit on its components, so match the ordered item too.
        queryset = queryset.filter(
            Q(variant__product=product) | Q(order_line__variant__product=product)
        )
    if order is not None:
        queryset = queryset.filter(order_line__order=order)
    if status:
        queryset = queryset.filter(status=status)
    if kind:
        queryset = queryset.filter(variant__product__category__category_type=kind)
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
