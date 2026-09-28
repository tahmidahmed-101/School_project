"""Per-phone delivery history, and the fraud signal derived from it.

Rebuilt from our own shipment outcomes whenever one settles.
"""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Max, Q

from apps.common.utils.phone import local_bd_mobile
from apps.risk.models import PhoneRiskProfile

# Below this, the history is too thin to mean anything.
MIN_SETTLED_ORDERS = 3
HIGH_RISK_SUCCESS_RATE = Decimal("50.00")
MEDIUM_RISK_SUCCESS_RATE = Decimal("75.00")


def normalise_phone(raw: str) -> str:
    return local_bd_mobile(raw)


@transaction.atomic
def rebuild_phone_profile(raw_phone: str) -> PhoneRiskProfile | None:
    from apps.orders.models import Shipment

    phone = normalise_phone(raw_phone)
    if not phone:
        return None

    status = Shipment.Status
    shipments = Shipment.objects.filter(recipient_phone=phone)
    stats = shipments.aggregate(
        total=Count("id"),
        delivered=Count("id", filter=Q(status=status.DELIVERED)),
        returned=Count("id", filter=Q(status=status.RETURNED)),
        cancelled=Count("id", filter=Q(status=status.CANCELLED)),
        last_order=Max("created_at"),
        last_delivered=Max("delivered_at", filter=Q(status=status.DELIVERED)),
        last_returned=Max("updated_at", filter=Q(status=status.RETURNED)),
    )

    delivered = stats["delivered"] or 0
    returned = stats["returned"] or 0
    settled = delivered + returned
    rate = (
        (Decimal(delivered) / Decimal(settled) * 100).quantize(Decimal("0.01"))
        if settled
        else Decimal("0.00")
    )

    profile, _ = PhoneRiskProfile.objects.update_or_create(
        phone_number=phone,
        defaults={
            "total_orders": stats["total"] or 0,
            "delivered_count": delivered,
            "returned_count": returned,
            "cancelled_count": stats["cancelled"] or 0,
            "success_rate": rate,
            "last_order_at": stats["last_order"],
            "last_delivered_at": stats["last_delivered"],
            "last_returned_at": stats["last_returned"],
        },
    )
    return profile


def phone_risk_features(raw_phone: str) -> tuple[Decimal, list[str], dict]:
    """Risk points, human-readable reasons, and the features behind them.

    Returns zero points rather than guessing when the history is too thin.
    """
    phone = normalise_phone(raw_phone)
    if not phone:
        return Decimal("0.00"), [], {}

    profile = PhoneRiskProfile.objects.filter(phone_number=phone).first()
    features: dict[str, object] = {"phone_history_known": profile is not None}
    if profile is None:
        return Decimal("0.00"), [], features

    features.update(
        {
            "phone_total_orders": profile.total_orders,
            "phone_settled_orders": profile.settled_orders,
            "phone_returned_count": profile.returned_count,
            "phone_success_rate": float(profile.success_rate),
        }
    )

    if profile.settled_orders < MIN_SETTLED_ORDERS:
        return Decimal("0.00"), [], features

    score = Decimal("0.00")
    reasons: list[str] = []
    if profile.success_rate < HIGH_RISK_SUCCESS_RATE:
        score += Decimal("35.00")
        reasons.append(
            f"Phone delivers {profile.success_rate}% of the time "
            f"({profile.returned_count} of {profile.settled_orders} returned)"
        )
    elif profile.success_rate < MEDIUM_RISK_SUCCESS_RATE:
        score += Decimal("15.00")
        reasons.append(f"Phone has a {profile.success_rate}% delivery success rate")

    return score, reasons, features
