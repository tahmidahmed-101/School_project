from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.catalog.models import PriceIssueReport, Product, ProductVariant
from apps.common.exceptions import BusinessRuleViolationError


def report_price_issue(
    *,
    reporter,
    product: Product,
    variant: ProductVariant | None = None,
    expected_price: Decimal | None = None,
    comment: str = "",
) -> PriceIssueReport:
    if variant is not None and (
        variant.product_id != product.id or not variant.is_active or variant.deleted_at
    ):
        raise BusinessRuleViolationError(
            "Variant does not belong to this product.", code="variant_mismatch"
        )
    # One open report per customer per item: repeats add nothing staff need,
    # and would let one account flood the review queue.
    if PriceIssueReport.objects.filter(
        reporter=reporter,
        product=product,
        variant=variant,
        status=PriceIssueReport.Status.OPEN,
    ).exists():
        raise BusinessRuleViolationError(
            "You have already reported this price.", code="already_reported"
        )
    return PriceIssueReport.objects.create(
        reporter=reporter,
        product=product,
        variant=variant,
        expected_price=expected_price,
        comment=comment.strip(),
    )


@transaction.atomic
def update_price_report(
    *, report: PriceIssueReport, actor, status: str | None = None, staff_note: str | None = None
) -> PriceIssueReport:
    changed: set[str] = set()
    if staff_note is not None:
        report.staff_note = staff_note
        changed.add("staff_note")
    if status is not None and status != report.status:
        closed = status != PriceIssueReport.Status.OPEN
        report.status = status
        report.resolved_by = actor if closed else None
        report.resolved_at = timezone.now() if closed else None
        changed |= {"status", "resolved_by", "resolved_at"}
    if changed:
        report.save(update_fields=changed)
    return report
