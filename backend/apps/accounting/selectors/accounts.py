from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from apps.accounting.models import Account


def accounts_list(*, type: str | None = None, include_deleted: bool = False) -> QuerySet[Account]:
    queryset = Account.objects.all()
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    if type:
        queryset = queryset.filter(type=type)
    return queryset.order_by("code")


def get_account_by_id(account_id: str | UUID, *, include_deleted: bool = False) -> Account | None:
    queryset = Account.objects.all()
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    return queryset.filter(id=account_id).first()


def get_account_by_code(code: str) -> Account | None:
    return Account.objects.filter(code=code, deleted_at__isnull=True).first()
