from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from apps.procurement.models import VendorBill
from apps.procurement.selectors.kind import filter_by_kind


def vendor_bills_list(
    *, supplier=None, status: str | None = None, kind: str | None = None
) -> QuerySet[VendorBill]:
    queryset = (
        VendorBill.objects.select_related("supplier", "purchase_order")
        .prefetch_related("payments")
        .filter(deleted_at__isnull=True)
    )
    if supplier is not None:
        queryset = queryset.filter(supplier=supplier)
    if status:
        queryset = queryset.filter(status=status)
    queryset = filter_by_kind(queryset, kind, purchase_order_field="purchase_order_id")
    return queryset.order_by("-due_date")


def get_vendor_bill_by_id(bill_id: str | UUID) -> VendorBill | None:
    return (
        VendorBill.objects.select_related("supplier", "purchase_order")
        .prefetch_related("payments")
        .filter(id=bill_id, deleted_at__isnull=True)
        .first()
    )


def get_vendor_bill_for_document(bill_id: str | UUID) -> VendorBill | None:
    """Detail fetch that also walks the source PO lines, which the PDF prints."""
    return (
        VendorBill.objects.select_related("supplier", "purchase_order")
        .prefetch_related("payments", "purchase_order__lines__variant__product")
        .filter(id=bill_id, deleted_at__isnull=True)
        .first()
    )
