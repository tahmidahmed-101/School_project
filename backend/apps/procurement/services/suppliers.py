from __future__ import annotations

from django.db import transaction

from apps.common.exceptions import BusinessRuleViolationError
from apps.common.params import KIND_STOCK
from apps.procurement.models import Supplier


@transaction.atomic
def create_supplier(
    *,
    name: str,
    contact_email: str = "",
    phone: str = "",
    payment_terms: str = "",
    kind: str = KIND_STOCK,
) -> Supplier:
    return Supplier.objects.create(
        name=name, contact_email=contact_email, phone=phone, payment_terms=payment_terms, kind=kind
    )


def _check_kind_can_change(supplier: Supplier) -> None:
    if supplier.purchase_orders.exists() or supplier.vendor_bills.exists():
        raise BusinessRuleViolationError(
            "This supplier already has purchase orders or bills, so it cannot move between "
            "stock and pre-order.",
            code="supplier_kind_in_use",
        )


@transaction.atomic
def update_supplier(*, supplier: Supplier, data: dict) -> Supplier:
    allowed_fields = {"name", "contact_email", "phone", "payment_terms", "is_active", "kind"}
    if "kind" in data and data["kind"] != supplier.kind:
        _check_kind_can_change(supplier)
    for field, value in data.items():
        if field in allowed_fields:
            setattr(supplier, field, value)
    update_fields = [field for field in data if field in allowed_fields]
    if update_fields:
        supplier.save(update_fields=update_fields)
    return supplier
