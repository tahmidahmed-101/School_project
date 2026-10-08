from __future__ import annotations

from django.db import transaction

from apps.audit.services.audit import log_action
from apps.catalog.selectors.bundles import expand_variant
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.services.stock import reserve_stock
from apps.orders.models import Payment, SalesOrder, SalesOrderLine, StockReservation
from apps.orders.selectors.shipments import order_shipments_complete
from apps.orders.services.address_snapshot import SNAPSHOT_FIELDS, build_address_snapshot
from apps.orders.services.carts import (
    _check_preorder_stock_limit,
    add_line,
    compute_line_tax,
    ensure_purchasable,
    ensure_single_kind,
)
from apps.orders.services.notifications import notify_order, order_label
from apps.orders.services.reservations import release_stock_reservation

UPDATABLE_ORDER_FIELDS = ("shipping_address", "notes", "contact_email", "contact_phone")

# Lines may only be corrected while every unit is still unshipped. Once a
# consignment goes out, `create_shipment` has already handed part of the hold
# back to Available while leaving the reservation rows at their original
# quantity, so releasing those rows again would double-count.
LINE_EDITABLE_STATUSES = frozenset(
    {
        SalesOrder.Status.PENDING,
        SalesOrder.Status.AWAITING_PAYMENT,
        SalesOrder.Status.CONFIRMED,
    }
)


# What the manual override may do. Checkout, payment capture and shipments
# move an order forward because they also move stock and money; the override
# only records what those have already done, so it can never skip one.
STATUS_OVERRIDES: dict[str, frozenset[str]] = {
    SalesOrder.Status.PENDING: frozenset({SalesOrder.Status.CANCELLED}),
    SalesOrder.Status.AWAITING_PAYMENT: frozenset({SalesOrder.Status.CANCELLED}),
    SalesOrder.Status.CONFIRMED: frozenset(
        {SalesOrder.Status.CANCELLED, SalesOrder.Status.DELIVERED, SalesOrder.Status.CLOSED}
    ),
    SalesOrder.Status.SHIPPED: frozenset({SalesOrder.Status.DELIVERED, SalesOrder.Status.CLOSED}),
    SalesOrder.Status.DELIVERED: frozenset({SalesOrder.Status.CLOSED}),
    SalesOrder.Status.CLOSED: frozenset(),
    SalesOrder.Status.CANCELLED: frozenset(),
}


def allowed_status_overrides(order: SalesOrder) -> list[str]:
    allowed = STATUS_OVERRIDES.get(order.status, frozenset())
    return [value for value in SalesOrder.Status.values if value in allowed]


def lock_order(order: SalesOrder) -> SalesOrder:
    """Take a row lock on the order for the rest of the transaction and
    refresh the caller's instance to the locked state.

    Deliberately refreshes in place rather than returning a second instance:
    every caller keeps using the object it passed in, so status checks and
    the value the API serializes afterwards can't drift apart.
    """
    SalesOrder.objects.select_for_update().filter(pk=order.pk).exists()
    order.refresh_from_db()
    return order


@transaction.atomic
def cancel_order(*, order: SalesOrder, actor=None) -> SalesOrder:
    """Cancel a pending or confirmed order. Active stock reservations are
    released back to Available (no ledger entry — stock never physically
    moved, blueprint §5). Cancelling never refunds money by itself — that is
    a separate, explicitly approved step via `refund_payment`."""
    lock_order(order)
    if order.status not in {
        SalesOrder.Status.PENDING,
        SalesOrder.Status.AWAITING_PAYMENT,
        SalesOrder.Status.CONFIRMED,
    }:
        raise BusinessRuleViolationError(
            "Only orders that have not shipped yet can be cancelled.",
            code="invalid_order_status",
        )
    # A confirmed order can already have a consignment out: the order only
    # becomes "shipped" once every line has gone.
    if order.lines.filter(shipped_quantity__gt=0).exists():
        raise BusinessRuleViolationError(
            "Part of this order has already shipped. Receive the parcel back or "
            "use a return instead of cancelling.",
            code="order_partly_shipped",
        )

    reservations = StockReservation.objects.select_for_update().filter(
        order_line__order=order,
        status=StockReservation.Status.ACTIVE,
    )
    for reservation in reservations:
        release_stock_reservation(reservation=reservation, actor=actor)

    # Cash on delivery that was never collected is no longer owed.
    Payment.objects.filter(order=order, status=Payment.Status.PENDING).update(
        status=Payment.Status.FAILED
    )
    order.status = SalesOrder.Status.CANCELLED
    order.updated_by = actor
    order.save(update_fields=["status", "updated_by", "updated_at"])
    notify_order(order, f"{order_label(order)} was cancelled.")
    return order


@transaction.atomic
def delete_order(*, order: SalesOrder, actor=None) -> None:
    """Nuclear delete — releases holds, drops payments/shipments/RMAs that
    would PROTECT-block it. Temporary, no undo."""
    order = lock_order(order)
    for reservation in StockReservation.objects.select_for_update().filter(
        order_line__order=order,
        status=StockReservation.Status.ACTIVE,
    ):
        release_stock_reservation(reservation=reservation, actor=actor)

    order.payments.all().delete()
    order.shipments.all().delete()
    order.rmas.all().delete()

    order_id = order.id
    order_number = order.order_number
    order.delete()
    log_action(
        actor=actor,
        action="order.deleted",
        target_type="SalesOrder",
        target_id=order_id,
        metadata={"order_number": order_number},
    )


@transaction.atomic
def update_order(*, order: SalesOrder, data: dict, actor=None) -> SalesOrder:
    """Correct operator-editable fields on an existing order.

    `status` is deliberately absent from `UPDATABLE_ORDER_FIELDS` and silently
    dropped here: it moves through `set_order_status` alone, so no caller can
    smuggle it in via this path.
    """
    order = lock_order(order)
    updates = {field: data[field] for field in UPDATABLE_ORDER_FIELDS if field in data}
    ship_to = {field: data[field] for field in SNAPSHOT_FIELDS if field in data}

    if not updates and not ship_to:
        raise BusinessRuleViolationError(
            "No updatable fields supplied.", code="no_updatable_fields"
        )

    for field, value in updates.items():
        setattr(order, field, value)

    # Picking a different saved address reseeds the snapshot; explicit ship-to
    # edits then win, so one PATCH can do both.
    snapshot = dict(order.shipping_address_snapshot or {})
    if "shipping_address" in updates:
        snapshot = build_address_snapshot(updates["shipping_address"])
    if ship_to:
        snapshot.update(ship_to)
    if snapshot != (order.shipping_address_snapshot or {}):
        order.shipping_address_snapshot = snapshot
        updates["shipping_address_snapshot"] = snapshot

    order.updated_by = actor
    order.save(update_fields=[*updates, "updated_by", "updated_at"])
    return order


@transaction.atomic
def set_order_status(*, order: SalesOrder, new_status: str, actor=None) -> SalesOrder:
    """Operator override for the status field.

    Cancelling is delegated to `cancel_order` so stock reservations are
    actually released rather than stranded. Reviving a cancelled order is
    refused: its holds are gone, and re-reserving may be impossible if the
    stock has since been sold.
    """
    order = lock_order(order)
    if new_status not in SalesOrder.Status.values:
        raise BusinessRuleViolationError("Unknown order status.", code="invalid_status")
    if new_status == order.status:
        return order

    if order.status == SalesOrder.Status.CANCELLED:
        raise BusinessRuleViolationError(
            "A cancelled order cannot be reopened — its stock reservations are already "
            "released. Place a new order instead.",
            code="order_cancelled",
        )
    # Delivery is reached by shipping and delivering consignments, which is
    # where stock leaves and reservations are released. The override may only
    # record it once that has already happened, never stand in for it.
    if new_status == SalesOrder.Status.DELIVERED and not order_shipments_complete(order):
        raise BusinessRuleViolationError(
            "An order can only be marked delivered once delivered consignments cover "
            "the full quantity of every line.",
            code="shipments_incomplete",
        )

    if new_status not in STATUS_OVERRIDES[order.status]:
        raise BusinessRuleViolationError(
            f"An order that is {order.get_status_display().lower()} cannot be set to "
            f"{SalesOrder.Status(new_status).label.lower()} by hand. Capture the payment or "
            "create the shipment instead.",
            code="status_change_not_allowed",
        )
    if new_status == SalesOrder.Status.CANCELLED:
        return cancel_order(order=order, actor=actor)
    previous = order.status
    order.status = new_status
    order.updated_by = actor
    order.save(update_fields=["status", "updated_by", "updated_at"])
    log_action(
        actor=actor,
        action="order.status_overridden",
        target_type="SalesOrder",
        target_id=order.id,
        metadata={"from": previous, "to": new_status},
    )
    notify_order(order, f"{order_label(order)} is now {order.get_status_display().lower()}.")
    return order


def _assert_line_editable(line: SalesOrderLine) -> None:
    if line.order.status not in LINE_EDITABLE_STATUSES:
        raise BusinessRuleViolationError(
            "Lines can only be changed before the order ships.",
            code="lines_frozen",
        )
    if line.shipped_quantity:
        raise BusinessRuleViolationError(
            "This line has already shipped in part. Use a return instead.",
            code="line_shipped",
        )


def _rebuild_line_reservations(line: SalesOrderLine, *, actor=None) -> None:
    """Re-hold exactly `line.quantity` units. Safe only for an unshipped line:
    nothing has been partially released, so the rows still match what inventory
    has reserved."""
    active = StockReservation.objects.select_for_update().filter(
        order_line=line, status=StockReservation.Status.ACTIVE
    )
    had_reservations = False
    for reservation in active:
        had_reservations = True
        release_stock_reservation(reservation=reservation, actor=actor)

    # A pre-order line goes back to the queue; allocation hands stock out again.
    if line.is_preorder:
        if line.allocated_quantity:
            line.allocated_quantity = 0
            line.save(update_fields=["allocated_quantity", "updated_at"])
        return

    # A pending order has not reserved anything yet — checkout does that.
    if not had_reservations:
        return

    for component, component_qty in expand_variant(line.variant, line.quantity):
        reserve_stock(variant=component, quantity=component_qty)
        StockReservation.objects.create(
            order_line=line,
            variant=component,
            quantity=component_qty,
        )


def ensure_variant_of_kind(variant, kind: str) -> None:
    if variant.product.category.category_type != kind:
        label = SalesOrder.OrderType(kind).label.lower()
        raise BusinessRuleViolationError(
            f"{variant.product.name} ({variant.sku}) cannot go on a {label} order.",
            code="order_kind_mismatch",
        )


@transaction.atomic
def add_staff_order_lines(
    *, order: SalesOrder, lines: list[tuple], kind: str = SalesOrder.OrderType.STOCK
) -> None:
    """Lines of an order staff key in. Every line must be of the order's kind;
    `add_line` then applies the shopper's own window, limit and price rules."""
    for variant, _quantity in lines:
        ensure_variant_of_kind(variant, kind)
    for variant, quantity in lines:
        add_line(order=order, variant=variant, quantity=quantity)


@transaction.atomic
def add_order_line(*, order: SalesOrder, variant, quantity: int, actor=None) -> SalesOrderLine:
    """Add a variant to an order that has not shipped, at today's price.

    A checked-out order holds stock per line, so the new line reserves its own
    here, as checkout would have. A pending order reserves nothing until it is
    checked out, and a pre-order line never does.
    """
    order = lock_order(order)
    if order.status not in LINE_EDITABLE_STATUSES:
        raise BusinessRuleViolationError(
            "Lines can only be changed before the order ships.",
            code="lines_frozen",
        )
    if quantity <= 0:
        raise BusinessRuleViolationError("Quantity must be positive.", code="invalid_quantity")
    # A pending order has no kind yet; the mixed-basket check covers it.
    if order.status != SalesOrder.Status.PENDING:
        ensure_variant_of_kind(variant, order.order_type)
    if order.lines.filter(variant=variant).exists():
        raise BusinessRuleViolationError(
            "This item is already on the order. Change its quantity instead.",
            code="line_exists",
        )
    ensure_purchasable(variant)
    is_preorder = variant.is_preorder_kind
    ensure_single_kind(order, is_preorder=is_preorder)
    if is_preorder and variant.preorder_stock_limit is not None:
        _check_preorder_stock_limit(variant, quantity)

    unit_price = variant.effective_price
    line = SalesOrderLine.objects.create(
        order=order,
        variant=variant,
        quantity=quantity,
        unit_price=unit_price,
        tax_amount=compute_line_tax(unit_price=unit_price, quantity=quantity),
        product_name=variant.product.name,
        variant_sku=variant.sku,
        is_preorder=is_preorder,
    )
    if order.status != SalesOrder.Status.PENDING and not is_preorder:
        for component, component_qty in expand_variant(variant, quantity):
            reserve_stock(variant=component, quantity=component_qty)
            StockReservation.objects.create(
                order_line=line,
                variant=component,
                quantity=component_qty,
            )
    order.recalculate_totals()
    log_action(
        actor=actor,
        action="order.line_added",
        target_type="SalesOrderLine",
        target_id=line.id,
        metadata={"order_id": str(order.id), "variant_id": str(variant.id), "quantity": quantity},
    )
    return line


@transaction.atomic
def update_order_line(*, line: SalesOrderLine, quantity: int, actor=None) -> SalesOrderLine:
    """Correct an unshipped line's quantity, re-holding stock to match."""
    lock_order(line.order)
    line.refresh_from_db()
    _assert_line_editable(line)
    if quantity <= 0:
        raise BusinessRuleViolationError("Quantity must be positive.", code="invalid_quantity")

    if line.is_preorder and quantity > line.quantity:
        ensure_purchasable(line.variant)
        held = 0 if line.order.status == SalesOrder.Status.PENDING else line.quantity
        _check_preorder_stock_limit(line.variant, quantity, held)

    line.quantity = quantity
    line.tax_amount = compute_line_tax(unit_price=line.unit_price, quantity=quantity)
    line.save(update_fields=["quantity", "tax_amount", "updated_at"])
    _rebuild_line_reservations(line, actor=actor)
    line.order.recalculate_totals()
    log_action(
        actor=actor,
        action="order.line_updated",
        target_type="SalesOrderLine",
        target_id=line.id,
        metadata={"order_id": str(line.order_id), "quantity": quantity},
    )
    return line


@transaction.atomic
def remove_order_line(*, line: SalesOrderLine, actor=None) -> None:
    """Drop an unshipped line and hand its held stock back."""
    order = lock_order(line.order)
    line.refresh_from_db()
    _assert_line_editable(line)
    if order.lines.count() <= 1:
        raise BusinessRuleViolationError(
            "An order must keep at least one line. Cancel it instead.",
            code="last_line",
        )

    for reservation in StockReservation.objects.select_for_update().filter(
        order_line=line, status=StockReservation.Status.ACTIVE
    ):
        release_stock_reservation(reservation=reservation, actor=actor)

    line_id = line.id
    line.delete()
    order.recalculate_totals()
    log_action(
        actor=actor,
        action="order.line_removed",
        target_type="SalesOrderLine",
        target_id=line_id,
        metadata={"order_id": str(order.id)},
    )
