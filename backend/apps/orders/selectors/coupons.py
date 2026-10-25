from __future__ import annotations

from uuid import UUID

from django.db.models import F, Q, QuerySet
from django.utils import timezone

from apps.orders.models import Coupon


def coupons_list(*, include_deleted: bool = False) -> QuerySet[Coupon]:
    queryset = Coupon.objects.prefetch_related("categories", "brands").filter(
        referrer__isnull=True
    )
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    return queryset.order_by("-created_at")


def get_coupon_by_id(coupon_id: str | UUID, *, include_deleted: bool = False) -> Coupon | None:
    queryset = Coupon.objects.prefetch_related("categories", "brands").filter(
        referrer__isnull=True
    )
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    return queryset.filter(id=coupon_id).first()


def get_active_coupon_by_code(code: str) -> Coupon | None:
    return Coupon.objects.filter(
        code__iexact=code, is_active=True, deleted_at__isnull=True
    ).first()


def storefront_coupons() -> QuerySet[Coupon]:
    """Coupons the storefront may advertise: opted in by staff and still
    redeemable right now. Everything else stays private — a code is only
    ever confirmed to someone who already knows it."""
    return (
        Coupon.objects.filter(
            show_on_storefront=True, is_active=True, deleted_at__isnull=True
        )
        .filter(Q(starts_at__isnull=True) | Q(starts_at__lte=timezone.now()))
        .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now()))
        .filter(Q(usage_limit__isnull=True) | Q(times_used__lt=F("usage_limit")))
        .order_by("min_order_amount", "code")
    )
