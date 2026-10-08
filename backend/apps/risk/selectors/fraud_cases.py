from __future__ import annotations

from uuid import UUID

from django.db.models import Q, QuerySet

from apps.common.utils.phone import is_bd_mobile, local_bd_mobile
from apps.risk.models import FraudCase, RiskAssessment

_TEXT_SEARCH_FIELDS = (
    "case_number",
    "order__order_number",
    "customer__email",
    "order__contact_email",
)
# The order's contact number, its delivery address's number, and the
# customer's own — stored as typed, so in any of 01…, 8801…, +8801….
_PHONE_SEARCH_FIELDS = ("order__contact_phone", "order__shipping_address__phone", "customer__phone")


def _search_q(search: str) -> Q:
    """icontains is case-insensitive, which covers email. A BD mobile number
    is also searched in its local 01XXXXXXXXX form, which is a substring of
    every stored variant, so +8801…, 8801… and 01… all find each other."""
    terms = {search}
    if is_bd_mobile(search):
        terms.add(local_bd_mobile(search))
    query = Q()
    for field in _TEXT_SEARCH_FIELDS:
        query |= Q(**{f"{field}__icontains": search})
    for field in _PHONE_SEARCH_FIELDS:
        for term in terms:
            query |= Q(**{f"{field}__icontains": term})
    return query


def fraud_cases_list(
    *, status: str | None = None, search: str | None = None, kind: str | None = None
) -> QuerySet[FraudCase]:
    queryset = FraudCase.objects.select_related("customer", "order", "assigned_to")
    if status:
        queryset = queryset.filter(status=status)
    if kind:
        queryset = queryset.filter(order__order_type=kind)
    if search:
        # Every searched relation is a forward foreign key, so the joins
        # can't duplicate a case row.
        queryset = queryset.filter(_search_q(search))
    return queryset


def get_fraud_case_by_id(case_id: str | UUID) -> FraudCase | None:
    return FraudCase.objects.select_related("customer", "order", "assigned_to").filter(
        id=case_id
    ).first()


def unresolved_high_risk_case(order) -> FraudCase | None:
    """The case holding this order's shipments, if any: a high-risk case staff
    haven't resolved yet."""
    return (
        FraudCase.objects.filter(
            order=order, risk_assessment__risk_level=RiskAssessment.RiskLevel.HIGH
        )
        .exclude(status=FraudCase.Status.RESOLVED)
        .order_by("created_at")
        .first()
    )
