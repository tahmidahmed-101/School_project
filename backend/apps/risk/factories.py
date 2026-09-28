from __future__ import annotations

from decimal import Decimal

import factory

from apps.accounts.factories import CustomerUserFactory
from apps.orders.factories import SalesOrderFactory
from apps.risk.models import FraudCase, IPBlock, PhoneBlock, PhoneRiskProfile, RiskAssessment


class RiskAssessmentFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = RiskAssessment

    customer = factory.SubFactory(CustomerUserFactory)
    order = factory.SubFactory(SalesOrderFactory)
    risk_level = RiskAssessment.RiskLevel.LOW
    risk_score = Decimal("0.00")
    risk_reasons: list = factory.LazyFunction(list)
    recommended_action = RiskAssessment.RecommendedAction.APPROVE


class FraudCaseFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = FraudCase

    case_number = factory.Sequence(lambda n: f"FC-{n:08d}")
    customer = factory.SubFactory(CustomerUserFactory)
    order = factory.SubFactory(SalesOrderFactory)
    description = "High-risk order detected"


class PhoneRiskProfileFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = PhoneRiskProfile

    phone_number = factory.Sequence(lambda n: f"017{n:08d}")


class PhoneBlockFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = PhoneBlock

    phone_number = factory.Sequence(lambda n: f"018{n:08d}")
    reason = "Refused delivery repeatedly"


class IPBlockFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = IPBlock

    ip_address = factory.Sequence(lambda n: f"10.0.0.{n % 255}")
    reason = "Checkout abuse"
