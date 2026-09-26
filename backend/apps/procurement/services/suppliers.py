from __future__ import annotations

from django.db import transaction

from apps.procurement.models import Supplier


@transaction.atomic
def create_supplier(
    *, name: str, contact_email: str = "", phone: str = "", payment_terms: str = ""
) -> Supplier:
    return Supplier.objects.create(
        name=name, contact_email=contact_email, phone=phone, payment_terms=payment_terms
    )


@transaction.atomic
def update_supplier(*, supplier: Supplier, data: dict) -> Supplier:
    allowed_fields = {"name", "contact_email", "phone", "payment_terms", "is_active"}
    for field, value in data.items():
        if field in allowed_fields:
            setattr(supplier, field, value)
    update_fields = [field for field in data if field in allowed_fields]
    if update_fields:
        supplier.save(update_fields=update_fields)
    return supplier


@transaction.atomic
def deactivate_supplier(*, supplier: Supplier) -> Supplier:
    supplier.deactivate()
    return supplier
