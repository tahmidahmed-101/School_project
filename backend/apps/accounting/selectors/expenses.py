from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from django.db.models import QuerySet, Sum

from apps.accounting.models import Expense


def expenses_list(
    *,
    category_id: str | UUID | None = None,
    account_id: str | UUID | None = None,
    start: date | None = None,
    end: date | None = None,
    include_deleted: bool = False,
) -> QuerySet[Expense]:
    queryset = Expense.objects.all()
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    if category_id:
        queryset = queryset.filter(category_id=category_id)
    if account_id:
        queryset = queryset.filter(expense_account_id=account_id)
    if start:
        queryset = queryset.filter(expense_date__gte=start)
    if end:
        queryset = queryset.filter(expense_date__lte=end)
    return queryset.order_by("-expense_date")


def get_expense_by_id(expense_id: str | UUID, *, include_deleted: bool = False) -> Expense | None:
    queryset = Expense.objects.all()
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    return queryset.filter(id=expense_id).first()


def expense_summary(*, start: date, end: date) -> dict:
    queryset = expenses_list(start=start, end=end)
    total = queryset.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    breakdown = list(
        queryset.values("expense_account__code", "expense_account__name")
        .annotate(total=Sum("amount"))
        .order_by("-total")
    )
    # Simple mode never shows accounts, so the same totals are also grouped by
    # the category the owner actually picked.
    by_category = list(
        queryset.values("category_id", "category__name")
        .annotate(total=Sum("amount"))
        .order_by("-total")
    )
    return {
        "total": total,
        "by_account": [
            {
                "account_code": row["expense_account__code"],
                "account_name": row["expense_account__name"],
                "total": row["total"],
            }
            for row in breakdown
        ],
        "by_category": [
            {
                "category_id": row["category_id"],
                "category_name": row["category__name"] or "Uncategorised",
                "total": row["total"],
            }
            for row in by_category
        ],
    }
