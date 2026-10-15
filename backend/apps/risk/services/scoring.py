"""Fraud detection scoring.

Rule-based: order value, new-customer, and per-phone delivery history. No
ML-model integration.
"""

from __future__ import annotations

import logging
from decimal import Decimal

from django.conf import settings
from django.db import transaction

from apps.accounts.constants import StaffPermissionCode
from apps.accounts.services.telegram_links import alert_staff
from apps.common.utils.codes import generate_document_number
from apps.risk.models import FraudCase, RiskAssessment
from apps.risk.services.blocklist import active_block
from apps.risk.services.phone_profile import phone_risk_features

logger = logging.getLogger(__name__)

# Order value above which an order starts attracting risk points (BDT).
# Overridable via settings.RISK_ORDER_VALUE_THRESHOLDS = (high, very_high).
DEFAULT_ORDER_VALUE_THRESHOLDS: tuple[Decimal, Decimal] = (Decimal("15000"), Decimal("75000"))


def order_value_thresholds() -> tuple[Decimal, Decimal]:
    high, very_high = getattr(
        settings, "RISK_ORDER_VALUE_THRESHOLDS", DEFAULT_ORDER_VALUE_THRESHOLDS
    )
    return Decimal(high), Decimal(very_high)


def _generate_case_number() -> str:
    case_number = generate_document_number("FC")
    while FraudCase.objects.filter(case_number=case_number).exists():
        case_number = generate_document_number("FC")
    return case_number


def recipient_phone(order) -> str:
    """The number the parcel is going to. Not the account holder's phone:
    that says nothing about whether *this* parcel, going to a different
    number, will be accepted."""
    if order.contact_phone:
        return order.contact_phone
    if order.shipping_address_id:
        return order.shipping_address.phone
    return ""


@transaction.atomic
def assess_order_risk(*, order) -> RiskAssessment:
    """Score one order and persist a RiskAssessment. Opens a FraudCase for
    high-risk orders."""
    from apps.orders.models import SalesOrder

    risk_score = Decimal("0.00")
    risk_reasons: list[str] = []

    high_value, very_high_value = order_value_thresholds()
    if order.grand_total > high_value:
        risk_score += Decimal("20.00")
        risk_reasons.append(f"High value order (over {high_value:,.0f})")
    if order.grand_total > very_high_value:
        risk_score += Decimal("30.00")
        risk_reasons.append(f"Very high value order (over {very_high_value:,.0f})")

    # A guest cart has no customer yet; filtering on customer_id=None would
    # count every other guest cart as this "customer's" history.
    previous_orders = (
        SalesOrder.objects.filter(customer_id=order.customer_id).exclude(id=order.id).count()
        if order.customer_id
        else 0
    )
    if previous_orders == 0:
        risk_score += Decimal("15.00")
        risk_reasons.append("New customer with no order history")

    phone = recipient_phone(order)
    phone_score, phone_reasons, phone_features = phone_risk_features(phone)
    risk_score = min(risk_score + phone_score, Decimal("100.00"))
    risk_reasons.extend(phone_reasons)

    # A standing decision beats a score: a merchant who blocked this number is
    # not asking to have it re-argued on every order.
    block = active_block(phone)
    phone_features["phone_blocked"] = block is not None
    if block is not None:
        phone_features["phone_block_strength"] = block.strength
        risk_score = Decimal("100.00")
        risk_reasons.append(f"{block.get_strength_display()}: {block.reason}")

    if risk_score < 30:
        risk_level = RiskAssessment.RiskLevel.LOW
        recommended_action = RiskAssessment.RecommendedAction.APPROVE
    elif risk_score < 60:
        risk_level = RiskAssessment.RiskLevel.MEDIUM
        recommended_action = RiskAssessment.RecommendedAction.REVIEW
    else:
        risk_level = RiskAssessment.RiskLevel.HIGH
        recommended_action = RiskAssessment.RecommendedAction.BLOCK

    assessment = RiskAssessment.objects.create(
        customer=order.customer,
        order=order,
        risk_level=risk_level,
        risk_score=risk_score,
        risk_reasons=risk_reasons,
        features_used={
            "order_total": float(order.grand_total),
            "high_value_threshold": float(high_value),
            "previous_orders": previous_orders,
            **phone_features,
        },
        recommended_action=recommended_action,
        auto_blocked=(risk_level == RiskAssessment.RiskLevel.HIGH),
    )

    if risk_level == RiskAssessment.RiskLevel.HIGH:
        case_number = _generate_case_number()
        FraudCase.objects.create(
            case_number=case_number,
            status=FraudCase.Status.NEW,
            customer=order.customer,
            order=order,
            risk_assessment=assessment,
            description=f"High-risk order detected: {', '.join(risk_reasons)}",
        )
        alert_staff(
            f"⚠️ High-risk order {order.order_number} (case {case_number})\n"
            + "\n".join(f"• {reason}" for reason in risk_reasons),
            permissions=(StaffPermissionCode.ORDERS_VIEW, StaffPermissionCode.ORDERS_MANAGE),
        )

    return assessment
