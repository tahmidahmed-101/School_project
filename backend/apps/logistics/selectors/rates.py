from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from apps.common.params import KIND_STOCK
from apps.logistics.models import Carrier, ShippingRate, ShippingZone


def carriers_list(*, include_deleted: bool = False) -> QuerySet[Carrier]:
    queryset = Carrier.objects.all()
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    return queryset.order_by("name")


def get_carrier_by_id(carrier_id: str | UUID, *, include_deleted: bool = False) -> Carrier | None:
    queryset = Carrier.objects.all()
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    return queryset.filter(id=carrier_id).first()


def zones_list(*, include_deleted: bool = False, kind: str | None = None) -> QuerySet[ShippingZone]:
    queryset = ShippingZone.objects.prefetch_related("rates")
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    if kind is not None:
        queryset = queryset.filter(kind=kind)
    return queryset.order_by("name")


def get_zone_by_id(
    zone_id: str | UUID, *, include_deleted: bool = False, kind: str | None = None
) -> ShippingZone | None:
    queryset = ShippingZone.objects.prefetch_related("rates")
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    if kind is not None:
        queryset = queryset.filter(kind=kind)
    return queryset.filter(id=zone_id).first()


def _live_rates() -> QuerySet[ShippingRate]:
    """ShippingRate has no `deleted_at` of its own, so a rate counts as live
    only while both the zone and the carrier it belongs to are live."""
    return ShippingRate.objects.filter(
        zone__deleted_at__isnull=True, carrier__deleted_at__isnull=True
    )


def rates_list(
    *, zone=None, carrier=None, include_deleted: bool = False, kind: str | None = None
) -> QuerySet[ShippingRate]:
    queryset = ShippingRate.objects.all() if include_deleted else _live_rates()
    queryset = queryset.select_related("zone", "carrier")
    if kind is not None:
        queryset = queryset.filter(kind=kind)
    if zone is not None:
        queryset = queryset.filter(zone=zone)
    if carrier is not None:
        queryset = queryset.filter(carrier=carrier)
    return queryset.order_by("zone__name", "carrier__name")


def get_rate_by_id(rate_id: str | UUID, *, include_deleted: bool = False) -> ShippingRate | None:
    queryset = ShippingRate.objects.all() if include_deleted else _live_rates()
    return queryset.filter(id=rate_id).first()


def get_rate_for_zone_and_carrier(*, zone: ShippingZone, carrier: Carrier) -> ShippingRate | None:
    return _live_rates().filter(zone=zone, carrier=carrier, kind=zone.kind).first()


def find_zone_by_address_text(text: str) -> ShippingZone | None:
    """Matches one of the shop's zones by keyword (stored in
    `country_codes`, repurposed as free-text match terms) against the
    customer's address. A zone configured with no keywords is the catch-all,
    matched when nothing more specific does."""
    text_lower = (text or "").lower()
    fallback = None
    for zone in zones_list(kind=KIND_STOCK):
        keywords = zone.country_codes or []
        if not keywords:
            if fallback is None:
                fallback = zone
            continue
        if text_lower and any(str(keyword).lower() in text_lower for keyword in keywords):
            return zone
    return fallback


def address_zone_text(address) -> str:
    """Checkout collects one free-text address line, so that is what the zone
    keywords match. `city` is still folded in for orders placed before the
    separate district/thana fields were removed."""
    parts = [getattr(address, "line1", ""), getattr(address, "city", "")]
    return " ".join(part for part in parts if part)
