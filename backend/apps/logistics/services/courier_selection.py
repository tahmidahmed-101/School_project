"""Which carrier ships a parcel when none was picked by hand.

A manual choice always wins; failing that, the cheapest carrier that quotes a
live rate for this zone and weight -- the same numbers `shipping_options`
already shows a customer at checkout.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from apps.common.exceptions import BusinessRuleViolationError
from apps.logistics.models import Carrier
from apps.logistics.selectors.rates import carriers_list
from apps.logistics.services.rates import try_quote_shipping


@dataclass(frozen=True)
class CourierSelection:
    carrier: Carrier
    reason: str
    estimated_cost: Decimal | None = None


def select_courier(
    *, zone, weight: Decimal, override_carrier: Carrier | None = None
) -> CourierSelection:
    """Pick a carrier for one shipment's destination zone and weight.

    A manual override always wins, whatever the quotes say -- a dispatcher who
    knows one carrier is having a bad week should not have to touch pricing to
    route around it for one order.
    """
    if override_carrier is not None:
        return CourierSelection(carrier=override_carrier, reason="manual_override")

    best: tuple[Carrier, Decimal] | None = None
    for carrier in carriers_list().filter(is_active=True):
        cost = try_quote_shipping(zone=zone, weight=weight, carrier=carrier)
        if cost is None:
            continue
        if best is None or cost < best[1]:
            best = (carrier, cost)

    if best is None:
        raise BusinessRuleViolationError(
            "No active carrier has a shipping rate for this destination and weight.",
            code="no_carrier_available",
        )
    return CourierSelection(carrier=best[0], reason="lowest_cost", estimated_cost=best[1])
