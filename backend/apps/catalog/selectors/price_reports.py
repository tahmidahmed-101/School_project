from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from apps.catalog.models import PriceIssueReport


def price_reports_list(
    *, product=None, status: str | None = None, kind: str | None = None
) -> QuerySet[PriceIssueReport]:
    queryset = PriceIssueReport.objects.select_related(
        "reporter", "product", "variant", "resolved_by"
    )
    if product is not None:
        queryset = queryset.filter(product=product)
    if status:
        queryset = queryset.filter(status=status)
    if kind:
        queryset = queryset.filter(product__category__category_type=kind)
    return queryset


def get_price_report_by_id(report_id: str | UUID) -> PriceIssueReport | None:
    return price_reports_list().filter(id=report_id).first()
