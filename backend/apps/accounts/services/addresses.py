from __future__ import annotations

from django.db import transaction

from apps.accounts.models import Address, User


def _demote_other_defaults(*, user: User, keep: Address | None = None) -> None:
    """Must run before the new default is written: `uniq_default_address_per_user`
    rejects the moment two live rows for one user both have `is_default=True`."""
    queryset = Address.objects.filter(user=user, deleted_at__isnull=True, is_default=True)
    if keep is not None and keep.pk:
        queryset = queryset.exclude(id=keep.id)
    queryset.update(is_default=False)


@transaction.atomic
def create_address(*, user: User, data: dict) -> Address:
    if data.get("is_default"):
        _demote_other_defaults(user=user)
    return Address.objects.create(user=user, **data)


@transaction.atomic
def update_address(*, user: User, address: Address, data: dict) -> Address:
    for field, value in data.items():
        setattr(address, field, value)
    if address.is_default:
        _demote_other_defaults(user=user, keep=address)
    address.save()
    return address


@transaction.atomic
def delete_address(*, address: Address) -> None:
    address.soft_delete()


@transaction.atomic
def set_default_address(*, user: User, address: Address) -> Address:
    _demote_other_defaults(user=user, keep=address)
    address.is_default = True
    address.save(update_fields=["is_default", "updated_at"])
    return address
