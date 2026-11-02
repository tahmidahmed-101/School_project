from __future__ import annotations

from datetime import date
from uuid import UUID

from django.db.models import QuerySet

from apps.common.utils.dates import day_after, day_start
from apps.procurement.models import VendorPayment
from apps.procurement.selectors.kind import filter_by_kind


def vendor_payments_list(
    *,
    vendor_bill_id: str | UUID | None = None,
    method: str | None = None,
    start: date | None = None,
    end: date | None = None,
    kind: str | None = None,
) -> QuerySet[VendorPayment]:
    queryset = VendorPayment.objects.select_related("vendor_bill")
    if vendor_bill_id is not None:
        queryset = queryset.filter(vendor_bill_id=UUID(str(vendor_bill_id)))
    if method:
        queryset = queryset.filter(method=method)
    if start is not None:
        queryset = queryset.filter(paid_at__gte=day_start(start))
    if end is not None:
        queryset = queryset.filter(paid_at__lt=day_after(end))
    queryset = filter_by_kind(queryset, kind, purchase_order_field="vendor_bill__purchase_order_id")
    return queryset.order_by("-paid_at")


def get_vendor_payment_by_id(payment_id: str | UUID) -> VendorPayment | None:
    return VendorPayment.objects.select_related("vendor_bill").filter(id=payment_id).first()
