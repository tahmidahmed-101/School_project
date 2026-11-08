from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from apps.catalog.selectors.bundles import expand_variant
from apps.catalog.selectors.sales import prime_running_sales
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.services.stock import lock_variant_stock
from apps.logistics.selectors.rates import address_zone_text, find_zone_by_address_text
from apps.logistics.services.rates import quote_shipping
from apps.orders.models import SalesOrder
from apps.orders.services.address_snapshot import build_address_snapshot
from apps.orders.services.carts import compute_line_tax
from apps.orders.services.coupons import revalidate_applied_coupon
from apps.orders.services.orders import lock_order
from apps.orders.services.referrals import record_referral
from apps.orders.services.reservations import hold_line_stock
from apps.risk.services import blocklist, ip_blocklist


def order_weight(order: SalesOrder) -> Decimal:
    """Total shipment weight = sum(variant.weight x quantity). Zero when no
    weights are set, which still matches a rate bracket starting at 0."""
    weight = Decimal("0")
    for line in order.lines.select_related("variant"):
        if line.variant.weight is not None:
            weight += line.variant.weight * line.quantity
    return weight


def order_subtotal_now(order: SalesOrder) -> Decimal:
    """The subtotal checkout would charge: every line at today's price, since
    a cart keeps the price it was added at until checkout re-prices it."""
    lines = list(order.lines.select_related("variant__product__category"))
    prime_running_sales([line.variant for line in lines])
    return sum((line.variant.effective_price * line.quantity for line in lines), Decimal("0"))


def _reprice_lines(order: SalesOrder, lines) -> None:
    """A cart can outlive a price change or the end of an offer. The order is
    charged at today's price, which is the one the storefront is showing."""
    prime_running_sales([line.variant for line in lines])
    repriced = False
    for line in lines:
        unit_price = line.variant.effective_price
        if line.unit_price != unit_price:
            line.unit_price = unit_price
            line.tax_amount = compute_line_tax(unit_price=unit_price, quantity=line.quantity)
            line.save(update_fields=["unit_price", "tax_amount"])
            repriced = True
    if repriced:
        order.recalculate_totals()


def _settle_coupon(order: SalesOrder) -> None:
    # A cart can sit long enough for its applied coupon to expire or hit its
    # usage limit before checkout actually runs — re-validate here too.
    revalidate_applied_coupon(order)


def _free_expired_holds(order: SalesOrder) -> None:
    """Hand back what unpaid orders past their hold still keep of the stock this
    checkout needs, so stock frees up when it is wanted, not only when a
    scheduled sweep happens to run."""
    from apps.catalog.models import BundleItem
    from apps.orders.services.reservations import release_expired_reservations

    # A fixed two queries however long the cart: a bundle holds its
    # components' stock, so their ids count as well as its own.
    line_variant_ids = set(order.lines.values_list("variant_id", flat=True))
    if not line_variant_ids:
        return
    component_ids = BundleItem.objects.filter(bundle_variant_id__in=line_variant_ids).values_list(
        "component_variant_id", flat=True
    )
    release_expired_reservations(variant_ids=line_variant_ids | set(component_ids))


def _refuse_blocked(order: SalesOrder, shipping_address, ip_address: str) -> None:
    if ip_address and ip_blocklist.is_blocked(ip_address):
        raise BusinessRuleViolationError("This checkout could not be completed.", code="ip_blocked")
    # Both numbers: a guest's contact phone is the one the courier calls.
    phones = [order.contact_phone, shipping_address.phone if shipping_address else ""]
    if any(phone and blocklist.is_blocked(phone) for phone in phones):
        raise BusinessRuleViolationError(
            "This checkout could not be completed.", code="phone_blocked"
        )


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

    Refuses a checkout out from a blocked IP, or to a phone number staff have
    fully refused — both are standing merchant decisions, checked before any
    stock is touched. Advance-only phone blocks are a payment-method decision,
    not a checkout refusal, and are left to the payment step.
    """
    _refuse_blocked(order, shipping_address, ip_address)

    _free_expired_holds(order)

    lock_order(order)
    if order.status != SalesOrder.Status.PENDING:
        raise BusinessRuleViolationError(
            "Only a pending order can be checked out.", code="not_pending"
        )
    lines = list(order.lines.select_related("variant__product__category"))
    if not lines:
        raise BusinessRuleViolationError("Cannot checkout an empty order.", code="empty_order")

    _reprice_lines(order, lines)

    _settle_coupon(order)

    # Lock every stock row the holds below can touch in one go, in a fixed
    # order (by row), so two checkouts of the same items in a different cart
    # order queue up behind each other instead of deadlocking.
    lock_variant_stock(
        {
            component.id
            for line in lines
            for component, _ in expand_variant(line.variant, line.quantity)
        },
        create_missing=False,
    )

    for line in lines:
        for component, component_qty in expand_variant(line.variant, line.quantity):
            hold_line_stock(order_line=line, variant=component, quantity=component_qty)

    order.order_type = SalesOrder.OrderType.STOCK

    if shipping_address is not None:
        order.shipping_address = shipping_address
        order.shipping_address_snapshot = build_address_snapshot(shipping_address)
        zone = find_zone_by_address_text(address_zone_text(shipping_address))
        if zone is None:
            raise BusinessRuleViolationError(
                "Delivery is not available yet — no shipping zones are configured.",
                code="no_shipping_zone",
            )
        order.shipping_total = quote_shipping(
            zone=zone,
            weight=order_weight(order),
            carrier=carrier,
            subtotal=sum((line.unit_price * line.quantity for line in lines), Decimal("0")),
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
    record_referral(order)

    return order
