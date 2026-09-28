from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from apps.orders.models import Shipment


def shipments_list(*, order=None, status: str | None = None) -> QuerySet[Shipment]:
    queryset = Shipment.objects.select_related("order", "carrier").filter(deleted_at__isnull=True)
    if order is not None:
        queryset = queryset.filter(order=order)
    if status:
        queryset = queryset.filter(status=status)
    return queryset.order_by("-created_at")


def get_shipment_by_id(shipment_id: str | UUID) -> Shipment | None:
    return Shipment.objects.filter(id=shipment_id, deleted_at__isnull=True).first()


def get_shipment_by_carrier_and_tracking_number(carrier, tracking_number: str) -> Shipment | None:
    if not tracking_number:
        return None
    return Shipment.objects.select_related("order").filter(
        carrier=carrier, tracking_number=tracking_number, deleted_at__isnull=True
    ).first()
