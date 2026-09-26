from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from apps.orders.models import Coupon


def coupons_list(*, include_deleted: bool = False) -> QuerySet[Coupon]:
    queryset = Coupon.objects.all()
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    return queryset.order_by("-created_at")


def get_coupon_by_id(coupon_id: str | UUID, *, include_deleted: bool = False) -> Coupon | None:
    queryset = Coupon.objects.all()
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    return queryset.filter(id=coupon_id).first()


def get_active_coupon_by_code(code: str) -> Coupon | None:
    return Coupon.objects.filter(
        code__iexact=code, is_active=True, deleted_at__isnull=True
    ).first()
