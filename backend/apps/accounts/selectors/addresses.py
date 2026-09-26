from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from apps.accounts.models import Address, User


def addresses_for_user(user: User) -> QuerySet[Address]:
    return Address.objects.filter(user=user, deleted_at__isnull=True).order_by(
        "-is_default",
        "-created_at",
    )


def get_address_for_user(user: User, address_id: str | UUID) -> Address | None:
    return addresses_for_user(user).filter(id=address_id).first()


def default_address_for_user(user: User) -> Address | None:
    return addresses_for_user(user).filter(is_default=True).first()
