from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from apps.risk.models import FraudCase


def fraud_cases_list(*, status: str | None = None) -> QuerySet[FraudCase]:
    queryset = FraudCase.objects.select_related("customer", "order", "assigned_to")
    if status:
        queryset = queryset.filter(status=status)
    return queryset


def get_fraud_case_by_id(case_id: str | UUID) -> FraudCase | None:
    return FraudCase.objects.select_related("customer", "order", "assigned_to").filter(
        id=case_id
    ).first()
