from __future__ import annotations

import math
from decimal import Decimal

from django.db import transaction

from apps.business.selectors.business_profile import get_business_profile
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.services.soft_delete import soft_delete_instance
from apps.logistics.models import Carrier, ShippingRate, ShippingZone
from apps.logistics.selectors.rates import (
    carriers_list,
    get_rate_for_zone_and_carrier,
)
from apps.orders.models import Shipment


def calculate_shipping_rate(*, zone: ShippingZone, carrier: Carrier, weight: Decimal) -> Decimal:
    rate = get_rate_for_zone_and_carrier(zone=zone, carrier=carrier)
    if rate is None:
        raise BusinessRuleViolationError(
            "No shipping rate configured for this zone/carrier.", code="no_rate"
        )
    if weight <= rate.base_weight:
        return rate.base_charge
    increments = math.ceil((weight - rate.base_weight) / rate.increment_weight)
    return rate.base_charge + increments * rate.increment_charge


def is_free_delivery(*, subtotal: Decimal | None) -> bool:
    """The shop's free-delivery rule: an order whose subtotal (sale prices in,
    coupon not yet off) reaches the configured amount."""
    if subtotal is None:
        return False
    threshold = get_business_profile().free_delivery_min_amount
    if not threshold:
        return False
    return subtotal >= threshold


def _rate_quote(*, zone: ShippingZone | None, weight: Decimal, carrier) -> Decimal | None:
    if zone is None:
        return None
    # Any active carrier that has a rate here, not merely the first one — picking
    # blind fails the quote whenever that carrier skips this zone.
    candidates = [carrier] if carrier is not None else list(carriers_list().filter(is_active=True))
    for candidate in candidates:
        try:
            return calculate_shipping_rate(zone=zone, carrier=candidate, weight=weight)
        except BusinessRuleViolationError:
            continue
    return None


def try_quote_shipping(
    *,
    zone: ShippingZone | None,
    weight: Decimal,
    carrier=None,
    subtotal: Decimal | None = None,
) -> Decimal | None:
    """Quote shipping, or None when nothing
    matches — for pickers and previews that show "unavailable" rather than
    blocking. Checkout must use `quote_shipping`, which refuses to guess.

    With `subtotal`, a destination that can be delivered to is quoted at zero
    once the order qualifies for free delivery."""
    quote = _rate_quote(zone=zone, weight=weight, carrier=carrier)
    if quote is not None and is_free_delivery(subtotal=subtotal):
        return Decimal("0.00")
    return quote


def quote_shipping(
    *,
    zone: ShippingZone | None,
    weight: Decimal,
    carrier=None,
    subtotal: Decimal | None = None,
) -> Decimal:
    """Refuses rather than returning None: a missing rate used to be coerced to
    zero, which shipped orders free."""
    quote = try_quote_shipping(zone=zone, weight=weight, carrier=carrier, subtotal=subtotal)
    if quote is None:
        raise BusinessRuleViolationError(
            "No shipping rate is configured for this destination and weight.",
            code="no_shipping_rate",
        )
    return quote


@transaction.atomic
def create_carrier(
    *,
    name: str,
    code: str = Carrier.Provider.MANUAL,
    phone: str = "",
    contact_email: str = "",
    api_base_url: str = "",
    api_key: str = "",
    api_secret: str = "",
    webhook_secret: str = "",
    is_integration_enabled: bool = False,
    config: dict | None = None,
) -> Carrier:
    return Carrier.objects.create(
        name=name,
        code=code,
        phone=phone,
        contact_email=contact_email,
        api_base_url=api_base_url,
        api_key=api_key,
        api_secret=api_secret,
        webhook_secret=webhook_secret,
        is_integration_enabled=is_integration_enabled,
        config=config or {},
    )


@transaction.atomic
def update_carrier(*, carrier: Carrier, **fields) -> Carrier:
    for field, value in fields.items():
        setattr(carrier, field, value)
    carrier.save(update_fields=[*fields.keys(), "updated_at"])
    return carrier


@transaction.atomic
def create_zone(*, name: str, country_codes: list[str] | None = None) -> ShippingZone:
    zone = ShippingZone(name=name, country_codes=country_codes or [])
    _check_zone_name_free(name=name, kind=zone.kind)
    zone.save()
    return zone


def _check_zone_name_free(*, name: str, kind: str, exclude_id=None) -> None:
    if ShippingZone.objects.filter(name=name, kind=kind).exclude(id=exclude_id).exists():
        raise BusinessRuleViolationError(
            "A delivery zone with this name already exists.", code="zone_exists"
        )


@transaction.atomic
def update_zone(*, zone: ShippingZone, **fields) -> ShippingZone:
    if "name" in fields:
        _check_zone_name_free(name=fields["name"], kind=zone.kind, exclude_id=zone.id)
    for field, value in fields.items():
        setattr(zone, field, value)
    zone.save(update_fields=[*fields.keys(), "updated_at"])
    return zone


def _validate_rate_fields(
    base_weight: Decimal, base_charge: Decimal, increment_weight: Decimal, increment_charge: Decimal
) -> None:
    if base_weight < 0 or base_charge < 0 or increment_charge < 0:
        raise BusinessRuleViolationError(
            "Weight and charge fields cannot be negative.", code="invalid_rate"
        )
    if increment_weight <= 0:
        raise BusinessRuleViolationError(
            "increment_weight must be greater than zero.", code="invalid_rate"
        )


@transaction.atomic
def create_rate(
    *,
    zone: ShippingZone,
    carrier: Carrier,
    base_weight: Decimal,
    base_charge: Decimal,
    increment_weight: Decimal,
    increment_charge: Decimal,
) -> ShippingRate:
    """A rate takes the kind of its zone."""
    _validate_rate_fields(base_weight, base_charge, increment_weight, increment_charge)
    if get_rate_for_zone_and_carrier(zone=zone, carrier=carrier) is not None:
        raise BusinessRuleViolationError(
            "A rate is already configured for this zone and carrier.", code="rate_exists"
        )
    return ShippingRate.objects.create(
        zone=zone,
        carrier=carrier,
        kind=zone.kind,
        base_weight=base_weight,
        base_charge=base_charge,
        increment_weight=increment_weight,
        increment_charge=increment_charge,
    )


@transaction.atomic
def update_rate(*, rate: ShippingRate, **fields) -> ShippingRate:
    merged = {
        "base_weight": fields.get("base_weight", rate.base_weight),
        "base_charge": fields.get("base_charge", rate.base_charge),
        "increment_weight": fields.get("increment_weight", rate.increment_weight),
        "increment_charge": fields.get("increment_charge", rate.increment_charge),
    }
    _validate_rate_fields(**merged)
    for field, value in fields.items():
        setattr(rate, field, value)
    rate.save(update_fields=[*fields.keys(), "updated_at"])
    return rate


def shipping_options(
    *, zone: ShippingZone | None, weight: Decimal, subtotal: Decimal | None = None
) -> list[dict]:
    """Quotes for every selectable carrier, so a storefront picker shows the
    same numbers checkout will charge. `cost` is None when nothing matches."""
    return [
        {
            "carrier": carrier,
            "cost": try_quote_shipping(
                zone=zone, weight=weight, carrier=carrier, subtotal=subtotal
            ),
        }
        for carrier in carriers_list().filter(is_active=True)
    ]


@transaction.atomic
def delete_carrier(*, carrier: Carrier, actor=None) -> Carrier:
    if carrier.shipments.exclude(status__in=Shipment.TERMINAL_STATUSES).exists():
        raise BusinessRuleViolationError(
            "Carrier still has shipments in flight.", code="carrier_in_use"
        )
    return soft_delete_instance(carrier, actor=actor, code="carrier_in_use")


@transaction.atomic
def delete_zone(*, zone: ShippingZone, actor=None) -> ShippingZone:
    return soft_delete_instance(zone, actor=actor, code="zone_in_use")


@transaction.atomic
def delete_rate(*, rate: ShippingRate) -> None:
    """Hard delete: ShippingRate has no `deleted_at`, and it is pure pricing
    config that no other row references."""
    rate.delete()
