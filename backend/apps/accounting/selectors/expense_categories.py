from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from apps.accounting.models import ExpenseCategory


def expense_categories_list(*, include_deleted: bool = False) -> QuerySet[ExpenseCategory]:
    queryset = ExpenseCategory.objects.all()
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    return queryset.order_by("name")


def get_expense_category_by_id(
    category_id: str | UUID, *, include_deleted: bool = False
) -> ExpenseCategory | None:
    queryset = ExpenseCategory.objects.all()
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    return queryset.filter(id=category_id).first()
