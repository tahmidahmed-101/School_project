from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from apps.accounting.models import Account, TaxRate
from apps.business.constants import ModuleKey
from apps.business.services.modules import require_feature
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.services.soft_delete import soft_delete_instance

ACCOUNT_PROTECTED_RELATIONS = (
    "lines",
    "children",
    "expenses",
    "expense_payments",
    "expense_categories",
)

# Nothing points at a TaxRate by FK today; orders copy the rate onto the line.
# The scaffold stays so a future referencing model only has to be listed here.
TAX_RATE_PROTECTED_RELATIONS: tuple[str, ...] = ()


@transaction.atomic
def create_account(*, code: str, name: str, type: str, parent: Account | None = None) -> Account:
    return Account.objects.create(code=code, name=name, type=type, parent=parent)


@transaction.atomic
def create_tax_rate(*, name: str, rate_percent: Decimal, region: str = "") -> TaxRate:
    require_feature(ModuleKey.ACCOUNTING, "tax")
    return TaxRate.objects.create(name=name, rate_percent=rate_percent, region=region)


@transaction.atomic
def update_account(*, account: Account, data: dict) -> Account:
    allowed_fields = {"code", "name", "type", "parent", "is_active"}
    update_fields = [field for field in data if field in allowed_fields]
    for field in update_fields:
        setattr(account, field, data[field])
    if update_fields:
        account.save(update_fields=update_fields)
    return account


@transaction.atomic
def update_tax_rate(*, tax_rate: TaxRate, data: dict) -> TaxRate:
    allowed_fields = {"name", "rate_percent", "region", "is_active"}
    update_fields = [field for field in data if field in allowed_fields]
    for field in update_fields:
        setattr(tax_rate, field, data[field])
    if update_fields:
        tax_rate.save(update_fields=update_fields)
    if data.get("is_default"):
        set_default_tax_rate(tax_rate=tax_rate)
    return tax_rate


@transaction.atomic
def set_default_tax_rate(*, tax_rate: TaxRate) -> TaxRate:
    if tax_rate.deleted_at is not None or not tax_rate.is_active:
        raise BusinessRuleViolationError(
            "Only an active tax rate can be the default.", code="tax_rate_not_active"
        )
    # Demote first: the partial unique index allows one default at a time.
    TaxRate.objects.filter(is_default=True).exclude(pk=tax_rate.pk).update(is_default=False)
    tax_rate.is_default = True
    tax_rate.save(update_fields=["is_default"])
    return tax_rate


@transaction.atomic
def delete_account(*, account: Account, actor=None) -> Account:
    return soft_delete_instance(
        account,
        actor=actor,
        protected_relations=ACCOUNT_PROTECTED_RELATIONS,
        code="account_in_use",
    )


@transaction.atomic
def delete_tax_rate(*, tax_rate: TaxRate, actor=None) -> TaxRate:
    return soft_delete_instance(
        tax_rate,
        actor=actor,
        protected_relations=TAX_RATE_PROTECTED_RELATIONS,
        code="tax_rate_in_use",
    )
