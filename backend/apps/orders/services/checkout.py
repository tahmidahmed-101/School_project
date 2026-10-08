from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from apps.catalog.selectors.bundles import expand_variant
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.services.stock import reserve_stock
from apps.logistics.selectors.rates import address_zone_text, find_zone_by_address_text
from apps.logistics.services.rates import quote_shipping
from apps.orders.models import SalesOrder, StockReservation
from apps.orders.services.address_snapshot import build_address_snapshot
from apps.orders.services.carts import (
    MIXED_BASKET_MESSAGE,
    _check_preorder_stock_limit,
    compute_line_tax,
    ensure_purchasable,
)
from apps.orders.services.coupons import (
    _compute_discount,
    drop_coupon_from_preorder,
    revalidate_applied_coupon,
)
from apps.orders.services.orders import lock_order
from apps.risk.services import blocklist, ip_blocklist


def order_weight(order: SalesOrder) -> Decimal:
    """Total shipment weight = sum(variant.weight x quantity). Zero when no
    weights are set, which still matches a rate bracket starting at 0."""
    weight = Decimal("0")
    for line in order.lines.select_related("variant"):
        if line.variant.weight is not None:
            weight += line.variant.weight * line.quantity
    return weight


def _is_preorder_line(line) -> bool:
    return line.variant.is_preorder_kind


def _reprice_lines(order: SalesOrder, lines) -> None:
    """A cart can outlive a price change or the end of an offer. The order is
    charged at today's price, which is the one the storefront is showing."""
    repriced = False
    for line in lines:
        unit_price = line.variant.effective_price
        if line.unit_price != unit_price:
            line.unit_price = unit_price
            line.tax_amount = compute_line_tax(unit_price=unit_price, quantity=line.quantity)
            line.save(update_fields=["unit_price", "tax_amount"])
            repriced = True
    if not repriced:
        return
    order.recalculate_totals()
    if order.coupon is not None:
        order.discount_total = _compute_discount(order.coupon, order.subtotal)
        order.save(update_fields=["discount_total", "updated_at"])


def _settle_coupon(order: SalesOrder, lines) -> None:
    if any(_is_preorder_line(line) for line in lines):
        drop_coupon_from_preorder(order)
    # A cart can sit long enough for its applied coupon to expire or hit its
    # usage limit before checkout actually runs — re-validate here too.
    revalidate_applied_coupon(order)


@transaction.atomic
def checkout(
    *, order: SalesOrder, shipping_address=None, carrier=None, ip_address: str = ""
) -> SalesOrder:
    """Reserve stock for every line (Available -> Reserved, no ledger entry
    yet, per blueprint §5). Bundles reserve their components' stock. The
    order moves to "awaiting_payment", which freezes its lines and makes
    checkout non-re-entrant; `payments.capture_payment` then flips it to
    "confirmed", matching the blueprint's Checkout -> Reserve -> Payment
    captured -> Order confirmed sequence.

    The order row is locked for the whole transaction so two concurrent
    checkouts of the same cart can't both pass the status gate and reserve
    stock twice.

    Pre-order lines skip real inventory stock reservation since the product
    may not be in stock yet.

    Refuses a checkout out from a blocked IP, or to a phone number staff have
    fully refused — both are standing merchant decisions, checked before any
    stock is touched. Advance-only phone blocks are a payment-method decision,
    not a checkout refusal, and are left to the payment step.
    """
    if ip_address and ip_blocklist.is_blocked(ip_address):
        raise BusinessRuleViolationError(
            "This checkout could not be completed.", code="ip_blocked"
        )
    if shipping_address is not None and blocklist.is_blocked(shipping_address.phone):
        raise BusinessRuleViolationError(
            "This checkout could not be completed.", code="phone_blocked"
        )

    lock_order(order)
    if order.status != SalesOrder.Status.PENDING:
        raise BusinessRuleViolationError(
            "Only a pending order can be checked out.", code="not_pending"
        )
    lines = list(order.lines.select_related("variant__product__category"))
    if not lines:
        raise BusinessRuleViolationError("Cannot checkout an empty order.", code="empty_order")

    for line in lines:
        variant = line.variant
        ensure_purchasable(variant)
        if variant.is_preorder_kind and variant.preorder_stock_limit is not None:
            _check_preorder_stock_limit(variant, line.quantity)

    _reprice_lines(order, lines)

    _settle_coupon(order, lines)

    kinds: set[bool] = set()
    for line in lines:
        # Re-derive and persist is_preorder here, not just at cart-add time:
        # this is the decision point for whether a reservation gets created,
        # so the stored flag must match it exactly or shipment can't tell
        # later whether a reservation exists to release.
        is_preorder = _is_preorder_line(line)
        if line.is_preorder != is_preorder:
            line.is_preorder = is_preorder
            line.save(update_fields=["is_preorder"])
        kinds.add(is_preorder)
        # Skip stock reservation for pre-order items (they don't need real inventory yet)
        if is_preorder:
            continue
        for component, component_qty in expand_variant(line.variant, line.quantity):
            reserve_stock(variant=component, quantity=component_qty)
            StockReservation.objects.create(
                order_line=line,
                variant=component,
                quantity=component_qty,
            )

    if len(kinds) > 1:
        raise BusinessRuleViolationError(MIXED_BASKET_MESSAGE, code="mixed_basket")
    order.order_type = (
        SalesOrder.OrderType.PREORDER if True in kinds else SalesOrder.OrderType.STOCK
    )

    if shipping_address is not None:
        order.shipping_address = shipping_address
        order.shipping_address_snapshot = build_address_snapshot(shipping_address)
        zone = find_zone_by_address_text(
            address_zone_text(shipping_address), kind=order.order_type
        )
        if zone is None:
            raise BusinessRuleViolationError(
                "Delivery is not available yet — no shipping zones are configured.",
                code="no_shipping_zone",
            )
        order.shipping_total = quote_shipping(
            zone=zone, weight=order_weight(order), kind=order.order_type, carrier=carrier
        )
    else:
        order.shipping_total = Decimal("0")

    order.status = SalesOrder.Status.AWAITING_PAYMENT
    order.save(
        update_fields=[
            "order_type",
            "shipping_address",
            "shipping_address_snapshot",
            "shipping_total",
            "status",
            "updated_at",
        ]
    )
    order.recalculate_totals()

    return order
