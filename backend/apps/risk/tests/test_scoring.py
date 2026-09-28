from __future__ import annotations

from decimal import Decimal

import pytest

from apps.orders.factories import SalesOrderFactory
from apps.risk.models import FraudCase, RiskAssessment
from apps.risk.services.blocklist import block_phone
from apps.risk.services.scoring import assess_order_risk

pytestmark = pytest.mark.django_db


def test_low_value_order_from_a_returning_customer_is_low_risk():
    order = SalesOrderFactory(grand_total=Decimal("1000.00"), contact_phone="01711223344")
    # A prior order makes the customer "returning".
    SalesOrderFactory(customer=order.customer)

    assessment = assess_order_risk(order=order)

    assert assessment.risk_level == RiskAssessment.RiskLevel.LOW
    assert assessment.recommended_action == RiskAssessment.RecommendedAction.APPROVE
    assert assessment.risk_score == Decimal("0.00")
    assert not FraudCase.objects.exists()


def test_high_value_order_from_a_new_customer_is_medium_risk():
    order = SalesOrderFactory(grand_total=Decimal("20000.00"), contact_phone="01711223344")

    assessment = assess_order_risk(order=order)

    # +20 (high value) +15 (new customer) = 35
    assert assessment.risk_score == Decimal("35.00")
    assert assessment.risk_level == RiskAssessment.RiskLevel.MEDIUM
    assert assessment.recommended_action == RiskAssessment.RecommendedAction.REVIEW


def test_very_high_value_new_customer_order_is_high_risk_and_opens_a_case():
    order = SalesOrderFactory(grand_total=Decimal("100000.00"), contact_phone="01711223344")

    assessment = assess_order_risk(order=order)

    # +20 +30 (very high value) +15 (new customer) = 65
    assert assessment.risk_score == Decimal("65.00")
    assert assessment.risk_level == RiskAssessment.RiskLevel.HIGH
    assert assessment.auto_blocked is True

    case = FraudCase.objects.get()
    assert case.order_id == order.id
    assert case.risk_assessment_id == assessment.id


def test_a_standing_phone_block_forces_the_score_to_100():
    order = SalesOrderFactory(grand_total=Decimal("100.00"), contact_phone="01711223344")
    SalesOrderFactory(customer=order.customer)  # returning customer, would otherwise score 0
    block_phone("01711223344", reason="Refused delivery")

    assessment = assess_order_risk(order=order)

    assert assessment.risk_score == Decimal("100.00")
    assert assessment.risk_level == RiskAssessment.RiskLevel.HIGH
    assert any("Advance payment only" in reason for reason in assessment.risk_reasons)
