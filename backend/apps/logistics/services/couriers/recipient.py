from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import TYPE_CHECKING

from .exceptions import CourierRejectedError

if TYPE_CHECKING:
    from apps.orders.models import Shipment


@dataclass(frozen=True)
class Recipient:
    name: str
    phone: str
    address: str
    city: str
    postal_code: str


def build_recipient(shipment: Shipment) -> Recipient:
    """Flatten the order's shipping address into the single name/phone/address
    triple all three Bangladeshi couriers expect. Raises rather than posting a
    blank address, which the providers accept and then fail to deliver."""
    address = shipment.order.shipping_address
    if address is None:
        raise CourierRejectedError(
            f"Order {shipment.order.order_number} has no shipping address to send to the courier.",
            code="missing_shipping_address",
        )

    lines = [address.line1, address.line2, address.city, address.postal_code]
    full_address = ", ".join(part.strip() for part in lines if part and part.strip())
    recipient = Recipient(
        name=(address.full_name or "").strip(),
        phone=(address.phone or "").strip(),
        address=full_address,
        city=(address.city or "").strip(),
        postal_code=(address.postal_code or "").strip(),
    )
    if not recipient.name or not recipient.phone or not recipient.address:
        raise CourierRejectedError(
            f"Order {shipment.order.order_number} is missing a recipient name, "
            "phone or address — the courier will reject it.",
            code="incomplete_shipping_address",
        )
    return recipient


def item_description(shipment: Shipment) -> str:
    names = [
        str(line.order_line.variant)
        for line in shipment.lines.select_related("order_line__variant")
    ]
    return ", ".join(names)[:250]


def total_quantity(shipment: Shipment) -> int:
    return sum(line.quantity for line in shipment.lines.all()) or 1


def cod_amount(shipment: Shipment) -> Decimal:
    return Decimal(shipment.cod_amount or 0)


def total_weight(shipment: Shipment) -> Decimal:
    """Summed variant weight in whatever unit ShippingRate brackets use (kg).
    Returns 0 when no variant on the shipment carries a weight."""
    total = Decimal(0)
    for line in shipment.lines.select_related("order_line__variant"):
        weight = line.order_line.variant.weight
        if weight:
            total += Decimal(weight) * line.quantity
    return total
