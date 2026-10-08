from __future__ import annotations

from datetime import date
from uuid import UUID

from django.db.models import QuerySet

from apps.accounting.models import Expense
from apps.accounting.selectors.kind import COMPANY


def expenses_list(
    *,
    category_id: str | UUID | None = None,
    account_id: str | UUID | None = None,
    start: date | None = None,
    end: date | None = None,
    kind: str | None = None,
    include_deleted: bool = False,
) -> QuerySet[Expense]:
    queryset = Expense.objects.all()
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    if category_id:
        queryset = queryset.filter(category_id=UUID(str(category_id)))
    if account_id:
        queryset = queryset.filter(expense_account_id=UUID(str(account_id)))
    if start:
        queryset = queryset.filter(expense_date__gte=start)
    if end:
        queryset = queryset.filter(expense_date__lte=end)
    if kind:
        queryset = queryset.filter(kind="" if kind == COMPANY else kind)
    return queryset.order_by("-expense_date")


def get_expense_by_id(expense_id: str | UUID, *, include_deleted: bool = False) -> Expense | None:
    queryset = Expense.objects.all()
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    return queryset.filter(id=expense_id).first()
