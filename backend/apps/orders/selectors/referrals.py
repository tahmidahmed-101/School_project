from __future__ import annotations

from django.db.models import QuerySet

from apps.orders.models import Referral


def referrals_list() -> QuerySet[Referral]:
    return Referral.objects.select_related("referrer", "order", "reward_coupon").order_by(
        "-created_at"
    )


def rewards_of(user) -> QuerySet[Referral]:
    return (
        Referral.objects.filter(referrer=user, status=Referral.Status.REWARDED)
        .select_related("reward_coupon")
        .order_by("-rewarded_at")
    )
