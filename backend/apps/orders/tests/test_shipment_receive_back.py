"""Receiving back a cancelled or returned consignment is the exact inverse of
`create_shipment` for it: stock rejoins and is held again for the order, the
shipment's postings are reversed, and the units can be shipped again."""

from __future__ import annotations

from decimal import Decimal

import pytest
from django.db import IntegrityError, connection, transaction
from django.db.models import Sum
from django.test.utils import CaptureQueriesContext

from apps.accounting.constants import ACCOUNT_CODES
from apps.accounting.models import JournalEntry, JournalEntryLine
from apps.accounts.constants import StaffPermissionCode
from apps.accounts.factories import CustomerUserFactory
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.catalog.factories import ProductVariantFactory
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.models import StockLedgerEntry
from apps.inventory.selectors.stock import get_stock_item
from apps.inventory.services.stock import record_movement, write_off_stock
from apps.orders.models import SalesOrder, Shipment, StockReservation
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.orders import set_order_status
from apps.orders.services.payments import capture_payment
from apps.orders.services.returns import create_rma
from apps.orders.services.shipments import (
    create_shipment,
    receive_back_shipment,
    replace_damaged_units,
    update_shipment_status,
)

pytestmark = pytest.mark.django_db

STOCK = 20


def _confirmed(*quantities: int, shipping: Decimal = Decimal("0")):
    order = get_or_create_cart(CustomerUserFactory())
    variants = []
    for quantity in quantities:
        variant = ProductVariantFactory(price=Decimal("100.00"))
        record_movement(
            variant=variant,
            movement_type=MovementType.PURCHASE_IN,
            quantity=STOCK,
            unit_cost=Decimal("40"),
        )
        add_line(order=order, variant=variant, quantity=quantity)
        variants.append(variant)
    checkout(order=order)
    if shipping:
        SalesOrder.objects.filter(pk=order.pk).update(shipping_total=shipping)
    order.refresh_from_db()
    capture_payment(order=order, amount=order.grand_total)
    order.refresh_from_db()
    return order, variants


def _ship(order, quantities_by_line: dict) -> Shipment:
    return create_shipment(
        order=order,
        lines=[{"order_line": line, "quantity": qty} for line, qty in quantities_by_line.items()],
    )


def _cancelled(order, quantities_by_line: dict) -> Shipment:
    shipment = _ship(order, quantities_by_line)
    update_shipment_status(shipment=shipment, status=Shipment.Status.CANCELLED)
    return shipment


def _receive(shipment, damaged: dict | None = None):
    """Receive back with every unit sellable, except `damaged` units per order line."""
    damaged = damaged or {}
    return receive_back_shipment(
        shipment=shipment,
        dispositions={
            line.id: {
                "sellable": line.quantity - damaged.get(line.order_line_id, 0),
                "damaged": damaged.get(line.order_line_id, 0),
            }
            for line in shipment.lines.all()
        },
    )


def _body(shipment, damaged: int = 0) -> dict:
    return {
        "lines": [
            {
                "shipment_line_id": str(line.id),
                "sellable_quantity": line.quantity - damaged,
                "damaged_quantity": damaged,
            }
            for line in shipment.lines.all()
        ]
    }


def _status(order) -> str:
    order.refresh_from_db()
    return order.status


def _stock(variant) -> tuple[int, int]:
    item = get_stock_item(variant=variant)
    return item.quantity_on_hand, item.quantity_reserved


def _sales_out(variant) -> int:
    return sum(
        abs(entry.quantity)
        for entry in StockLedgerEntry.objects.filter(
            variant=variant, movement_type=MovementType.SALES_OUT
        )
    )


def _net(order, account_key: str) -> Decimal:
    """Credits minus debits on one account across every shipment of the order."""
    shipment_ids = list(order.shipments.values_list("id", flat=True))
    totals = JournalEntryLine.objects.filter(
        journal_entry__reference_id__in=shipment_ids,
        account__code=ACCOUNT_CODES[account_key],
    ).aggregate(debit=Sum("debit"), credit=Sum("credit"))
    return (totals["credit"] or Decimal("0")) - (totals["debit"] or Decimal("0"))


# --- Stock, reservations, order state ----------------------------------------


def test_receiving_back_restocks_reholds_and_reopens_the_order():
    order, (variant,) = _confirmed(2)
    line = order.lines.get()
    shipment = _cancelled(order, {line: 2})
    assert _status(order) == SalesOrder.Status.SHIPPED
    assert _stock(variant) == (STOCK - 2, 0)

    _receive(shipment)

    shipment.refresh_from_db()
    line.refresh_from_db()
    assert shipment.received_back_at is not None
    assert line.shipped_quantity == 0
    assert _status(order) == SalesOrder.Status.CONFIRMED
    assert _stock(variant) == (STOCK, 2)  # back on the shelf, held for this order
    assert (
        StockLedgerEntry.objects.filter(
            variant=variant, movement_type=MovementType.RETURN_IN, reference_id=shipment.id
        ).count()
        == 1
    )
    assert (
        StockReservation.objects.filter(
            order_line=line, status=StockReservation.Status.ACTIVE
        ).aggregate(total=Sum("quantity"))["total"]
        == 2
    )


def test_returned_consignment_can_be_received_back():
    order, (variant,) = _confirmed(1)
    shipment = _ship(order, {order.lines.get(): 1})
    update_shipment_status(shipment=shipment, status=Shipment.Status.RETURNED)

    _receive(shipment)

    assert _stock(variant) == (STOCK, 1)


def test_partly_shipped_line_keeps_its_reservation_rows():
    order, (variant,) = _confirmed(3)
    line = order.lines.get()
    shipment = _cancelled(order, {line: 1})
    rows_before = list(
        StockReservation.objects.filter(order_line=line).values_list("status", "quantity")
    )

    _receive(shipment)

    assert (
        list(StockReservation.objects.filter(order_line=line).values_list("status", "quantity"))
        == rows_before
    )
    assert _stock(variant) == (STOCK, 3)


def test_preorder_units_are_freed_without_any_stock_movement():
    order, (variant,) = _confirmed(1)
    line = order.lines.get()
    line.is_preorder = True
    line.save(update_fields=["is_preorder"])
    StockReservation.objects.filter(order_line=line).delete()
    stock = get_stock_item(variant=variant)
    stock.quantity_reserved = 0
    stock.save(update_fields=["quantity_reserved"])
    shipment = _cancelled(order, {line: 1})
    entries_before = StockLedgerEntry.objects.filter(variant=variant).count()

    _receive(shipment)

    line.refresh_from_db()
    assert line.shipped_quantity == 0
    assert StockLedgerEntry.objects.filter(variant=variant).count() == entries_before
    assert _stock(variant) == (STOCK, 0)


# --- Accounting ------------------------------------------------------------------


def test_postings_are_reversed_exactly():
    order, _ = _confirmed(2)
    shipment = _cancelled(order, {order.lines.get(): 2})
    assert _net(order, "revenue") == Decimal("200.00")
    assert _net(order, "inventory_asset") == Decimal("80.00")  # credited out of stock

    _receive(shipment)

    for account in ("revenue", "accounts_receivable", "tax_payable", "cogs", "inventory_asset"):
        assert _net(order, account) == Decimal("0"), account
    originals = JournalEntry.objects.filter(reference_id=shipment.id, reverses__isnull=True)
    assert originals.count() == 2
    assert all(entry.reversals.count() == 1 for entry in originals)


# --- Reshipping -------------------------------------------------------------------


def test_received_back_units_can_be_shipped_and_delivered_again():
    order, (variant,) = _confirmed(2)
    line = order.lines.get()
    _receive(_cancelled(order, {line: 2}))

    reshipment = _ship(order, {line: 2})
    update_shipment_status(shipment=reshipment, status=Shipment.Status.DELIVERED)

    assert _status(order) == SalesOrder.Status.DELIVERED
    assert _stock(variant) == (STOCK - 2, 0)
    # Two stock-outs and one return-in: net, the units left exactly once.
    assert _sales_out(variant) == 4
    assert not StockReservation.objects.filter(
        order_line=line, status=StockReservation.Status.ACTIVE
    ).exists()
    assert _net(order, "revenue") == Decimal("200.00")


def test_shipping_revenue_is_recognised_once_when_a_partial_consignment_is_reshipped():
    order, _ = _confirmed(2, shipping=Decimal("70.00"))
    line = order.lines.get()
    partial = _cancelled(order, {line: 1})
    completing = _ship(order, {line: 1})  # carries the shipping charge
    update_shipment_status(shipment=completing, status=Shipment.Status.DELIVERED)
    assert _net(order, "revenue") == Decimal("270.00")

    _receive(partial)
    reshipment = _ship(order, {line: 1})  # completes the order again

    assert reshipment.includes_shipping_revenue is False
    assert _net(order, "revenue") == Decimal("270.00")


def test_shipping_revenue_follows_the_reshipment_when_the_completing_one_comes_back():
    order, _ = _confirmed(1, shipping=Decimal("70.00"))
    line = order.lines.get()
    completing = _cancelled(order, {line: 1})
    assert completing.includes_shipping_revenue is True

    _receive(completing)
    assert _net(order, "revenue") == Decimal("0")
    reshipment = _ship(order, {line: 1})

    assert reshipment.includes_shipping_revenue is True
    assert _net(order, "revenue") == Decimal("170.00")


# --- Guards --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "status", [Shipment.Status.SHIPPED, Shipment.Status.OUT_FOR_DELIVERY, Shipment.Status.FAILED]
)
def test_only_cancelled_or_returned_consignments_can_be_received_back(status):
    order, _ = _confirmed(1)
    shipment = _ship(order, {order.lines.get(): 1})
    if status != Shipment.Status.SHIPPED:
        update_shipment_status(shipment=shipment, status=status)

    with pytest.raises(BusinessRuleViolationError) as exc:
        _receive(shipment)
    assert exc.value.code == "shipment_not_returned"


def test_delivered_consignment_cannot_be_received_back():
    order, _ = _confirmed(1)
    shipment = _ship(order, {order.lines.get(): 1})
    update_shipment_status(shipment=shipment, status=Shipment.Status.DELIVERED)

    with pytest.raises(BusinessRuleViolationError) as exc:
        _receive(shipment)
    assert exc.value.code == "shipment_not_returned"


def test_a_consignment_is_received_back_only_once():
    order, (variant,) = _confirmed(1)
    shipment = _cancelled(order, {order.lines.get(): 1})
    _receive(shipment)
    entries = StockLedgerEntry.objects.filter(variant=variant).count()

    with pytest.raises(BusinessRuleViolationError) as exc:
        _receive(Shipment.objects.get(pk=shipment.pk))

    assert exc.value.code == "already_received_back"
    assert StockLedgerEntry.objects.filter(variant=variant).count() == entries


def test_units_claimed_by_a_return_block_receiving_back():
    order, (variant,) = _confirmed(1)
    line = order.lines.get()
    shipment = _cancelled(order, {line: 1})
    create_rma(order=order, lines=[{"order_line": line, "quantity": 1}])

    with pytest.raises(BusinessRuleViolationError) as exc:
        _receive(shipment)

    assert exc.value.code == "units_claimed_by_return"
    assert _stock(variant) == (STOCK - 1, 0)


def test_closed_order_cannot_receive_back():
    order, _ = _confirmed(1)
    shipment = _cancelled(order, {order.lines.get(): 1})
    set_order_status(order=order, new_status=SalesOrder.Status.CLOSED)

    with pytest.raises(BusinessRuleViolationError) as exc:
        _receive(shipment)
    assert exc.value.code == "order_not_open"


# --- API --------------------------------------------------------------------------------


def _url(shipment) -> str:
    return f"/api/v1/admin/orders/shipments/{shipment.id}/receive-back/"


def test_admin_endpoint_receives_back(api_client, admin_user):
    order, _ = _confirmed(1)
    shipment = _cancelled(order, {order.lines.get(): 1})
    api_client.force_authenticate(user=admin_user)

    response = api_client.post(_url(shipment), _body(shipment), format="json")

    assert response.status_code == 200, response.data
    assert response.data["data"]["received_back_at"] is not None
    assert _status(order) == SalesOrder.Status.CONFIRMED


def test_endpoint_reports_domain_errors(api_client, admin_user):
    order, _ = _confirmed(1)
    shipment = _ship(order, {order.lines.get(): 1})
    api_client.force_authenticate(user=admin_user)

    response = api_client.post(_url(shipment), _body(shipment), format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "shipment_not_returned"


def test_endpoint_requires_returns_manage(api_client, staff_user):
    order, _ = _confirmed(1)
    shipment = _cancelled(order, {order.lines.get(): 1})
    set_staff_permission(
        staff_user=staff_user,
        permission_code=StaffPermissionCode.SHIPMENTS_UPDATE,
        is_enabled=True,
    )
    api_client.force_authenticate(user=staff_user)
    assert api_client.post(_url(shipment), _body(shipment), format="json").status_code == 403

    set_staff_permission(
        staff_user=staff_user, permission_code=StaffPermissionCode.RETURNS_MANAGE, is_enabled=True
    )
    assert api_client.post(_url(shipment), _body(shipment), format="json").status_code == 200


def test_receiving_back_split_consignments_then_cancelling_releases_everything():
    order, (variant,) = _confirmed(2)
    line = order.lines.get()
    first = _cancelled(order, {line: 1})
    second = _cancelled(order, {line: 1})

    _receive(first)
    _receive(second)
    assert _stock(variant) == (STOCK, 2)
    set_order_status(order=order, new_status=SalesOrder.Status.CANCELLED)

    assert _stock(variant) == (STOCK, 0)
    assert not StockReservation.objects.filter(
        order_line=line, status=StockReservation.Status.ACTIVE
    ).exists()


def test_receiving_back_does_not_refund_the_customer():
    order, _ = _confirmed(1)
    payment = order.payments.get()
    before = (payment.status, payment.refunded_amount)
    shipment = _cancelled(order, {order.lines.get(): 1})

    _receive(shipment)

    payment.refresh_from_db()
    assert (payment.status, payment.refunded_amount) == before
    assert not JournalEntry.objects.filter(reference_type="customer_refund").exists()


# --- Damaged units ------------------------------------------------------------------


def _tight_order(quantity: int):
    """An order that reserves every unit of its variant, so on hand equals reserved."""
    order = get_or_create_cart(CustomerUserFactory())
    variant = ProductVariantFactory(price=Decimal("100.00"))
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=quantity,
        unit_cost=Decimal("40"),
    )
    add_line(order=order, variant=variant, quantity=quantity)
    checkout(order=order)
    order.refresh_from_db()
    capture_payment(order=order, amount=order.grand_total)
    order.refresh_from_db()
    return order, variant


def _shrinkage_total(variant) -> Decimal:
    entry_ids = StockLedgerEntry.objects.filter(
        variant=variant, movement_type=MovementType.WRITE_OFF
    ).values_list("id", flat=True)
    return JournalEntryLine.objects.filter(
        journal_entry__reference_type="stock_writeoff",
        journal_entry__reference_id__in=list(entry_ids),
        account__code=ACCOUNT_CODES["inventory_shrinkage"],
    ).aggregate(total=Sum("debit"))["total"] or Decimal("0")


def test_receiving_all_as_sellable_then_writing_off_breaks_the_stock_constraint():
    """Why damaged units are disposed of at receive-back: once every unit is
    held again, a later write-off has no unreserved stock to take."""
    order, variant = _tight_order(2)
    shipment = _cancelled(order, {order.lines.get(): 2})
    _receive(shipment)
    assert _stock(variant) == (2, 2)

    with pytest.raises(IntegrityError), transaction.atomic():
        write_off_stock(variant=variant, quantity=1, reason="damaged")


def test_mixed_disposition_restocks_sellable_and_writes_off_damaged():
    order, variant = _tight_order(3)
    line = order.lines.get()
    shipment = _cancelled(order, {line: 3})

    _receive(shipment, damaged={line.id: 1})

    line.refresh_from_db()
    shipment_line = shipment.lines.get()
    assert _stock(variant) == (2, 2)  # 3 back in, 1 written off, 2 held again
    assert line.shipped_quantity == 1  # the damaged unit stays shipped, undelivered
    assert line.shippable_quantity == 2
    assert shipment_line.damaged_quantity == 1
    assert _status(order) == SalesOrder.Status.CONFIRMED
    assert _shrinkage_total(variant) == Decimal("40.00")
    held = StockReservation.objects.filter(
        order_line=line, status=StockReservation.Status.ACTIVE
    ).aggregate(total=Sum("quantity"))["total"]
    assert held == 2


def test_sellable_units_reship_but_the_damaged_quantity_keeps_the_order_unresolved():
    order, variant = _tight_order(3)
    line = order.lines.get()
    _receive(_cancelled(order, {line: 3}), damaged={line.id: 1})

    reshipment = _ship(order, {line: 2})
    update_shipment_status(shipment=reshipment, status=Shipment.Status.DELIVERED)

    assert _status(order) == SalesOrder.Status.SHIPPED  # 2 of 3 delivered
    assert _stock(variant) == (0, 0)
    assert not StockReservation.objects.filter(
        order_line=line, status=StockReservation.Status.ACTIVE
    ).exists()
    with pytest.raises(BusinessRuleViolationError) as exc:
        set_order_status(order=order, new_status=SalesOrder.Status.DELIVERED)
    assert exc.value.code == "shipments_incomplete"


def test_all_damaged_reserves_nothing_and_leaves_nothing_to_ship():
    order, variant = _tight_order(2)
    line = order.lines.get()
    shipment = _cancelled(order, {line: 2})

    _receive(shipment, damaged={line.id: 2})

    line.refresh_from_db()
    assert _stock(variant) == (0, 0)
    assert line.shippable_quantity == 0
    assert _status(order) == SalesOrder.Status.SHIPPED
    assert not StockReservation.objects.filter(
        order_line=line, status=StockReservation.Status.ACTIVE
    ).exists()
    with pytest.raises(BusinessRuleViolationError):
        _ship(order, {line: 1})


def test_mixed_disposition_keeps_the_books_balanced():
    order, variant = _tight_order(3)
    line = order.lines.get()
    _receive(_cancelled(order, {line: 3}), damaged={line.id: 1})

    for account in ("revenue", "accounts_receivable", "tax_payable", "cogs", "inventory_asset"):
        assert _net(order, account) == Decimal("0"), account
    assert _shrinkage_total(variant) == Decimal("40.00")


@pytest.mark.parametrize(
    "split",
    [
        {"sellable": 1, "damaged": 0},
        {"sellable": 2, "damaged": 2},
        {"sellable": -1, "damaged": 3},
    ],
    ids=["short", "over", "negative"],
)
def test_quantities_must_add_up_to_the_line(split):
    order, _ = _tight_order(2)
    shipment = _cancelled(order, {order.lines.get(): 2})
    entries = StockLedgerEntry.objects.count()

    with pytest.raises(BusinessRuleViolationError) as exc:
        receive_back_shipment(shipment=shipment, dispositions={shipment.lines.get().id: split})

    assert exc.value.code == "invalid_disposition"
    assert StockLedgerEntry.objects.count() == entries
    shipment.refresh_from_db()
    assert shipment.received_back_at is None


@pytest.mark.parametrize("which", ["missing", "unknown"])
def test_every_line_needs_exactly_one_disposition(which):
    order, _ = _tight_order(2)
    shipment = _cancelled(order, {order.lines.get(): 2})
    dispositions = (
        {}
        if which == "missing"
        else {"00000000-0000-0000-0000-000000000000": {"sellable": 2, "damaged": 0}}
    )

    with pytest.raises(BusinessRuleViolationError) as exc:
        receive_back_shipment(shipment=shipment, dispositions=dispositions)

    assert exc.value.code == "dispositions_mismatch"


def test_a_mixed_receive_back_cannot_run_twice():
    order, variant = _tight_order(2)
    line = order.lines.get()
    shipment = _cancelled(order, {line: 2})
    _receive(shipment, damaged={line.id: 1})
    entries = StockLedgerEntry.objects.filter(variant=variant).count()
    journals = JournalEntry.objects.count()

    with pytest.raises(BusinessRuleViolationError) as exc:
        _receive(Shipment.objects.get(pk=shipment.pk), damaged={line.id: 1})

    assert exc.value.code == "already_received_back"
    assert StockLedgerEntry.objects.filter(variant=variant).count() == entries
    assert JournalEntry.objects.count() == journals


def test_damaged_units_trigger_no_refund():
    order, _ = _tight_order(2)
    line = order.lines.get()
    payment = order.payments.get()
    before = (payment.status, payment.refunded_amount)

    _receive(_cancelled(order, {line: 2}), damaged={line.id: 2})

    payment.refresh_from_db()
    assert (payment.status, payment.refunded_amount) == before
    assert not JournalEntry.objects.filter(reference_type="customer_refund").exists()


def test_endpoint_takes_the_split_and_reports_damaged_quantities(api_client, admin_user):
    order, _ = _tight_order(3)
    shipment = _cancelled(order, {order.lines.get(): 3})
    api_client.force_authenticate(user=admin_user)

    response = api_client.post(_url(shipment), _body(shipment, damaged=1), format="json")

    assert response.status_code == 200, response.data
    assert response.data["data"]["lines"][0]["damaged_quantity"] == 1


def test_endpoint_rejects_bad_splits(api_client, admin_user):
    order, _ = _tight_order(2)
    shipment = _cancelled(order, {order.lines.get(): 2})
    api_client.force_authenticate(user=admin_user)
    line_id = str(shipment.lines.get().id)

    def line(sellable: int) -> dict:
        return {"shipment_line_id": line_id, "sellable_quantity": sellable, "damaged_quantity": 0}

    short = api_client.post(_url(shipment), {"lines": [line(1)]}, format="json")
    repeated = api_client.post(_url(shipment), {"lines": [line(1), line(1)]}, format="json")
    missing = api_client.post(_url(shipment), {}, format="json")

    assert short.data["error"]["code"] == "invalid_disposition"
    assert repeated.data["error"]["code"] == "dispositions_mismatch"
    assert missing.status_code == 400
    shipment.refresh_from_db()
    assert shipment.received_back_at is None


# --- What the admin panel reads ---------------------------------------------------


def test_shipment_detail_lists_lines_with_damaged_quantities(api_client, admin_user):
    order, variant = _tight_order(3)
    line = order.lines.get()
    shipment = _cancelled(order, {line: 3})
    _receive(shipment, damaged={line.id: 1})
    api_client.force_authenticate(user=admin_user)

    data = api_client.get(f"/api/v1/admin/orders/shipments/{shipment.id}/").data["data"]

    assert data["damaged_quantity"] == 1
    assert data["received_back_at"] is not None
    assert data["lines"] == [
        {
            "id": str(shipment.lines.get().id),
            "order_line_id": str(line.id),
            "sku": variant.sku,
            "product_name": variant.product.name,
            "quantity": 3,
            "damaged_quantity": 1,
            "replaced_quantity": 0,
            "unresolved_damaged_quantity": 1,
        }
    ]


def test_order_and_shipment_list_show_unresolved_damaged_units(api_client, admin_user):
    order, _ = _tight_order(2)
    line = order.lines.get()
    shipment = _cancelled(order, {line: 2})
    _receive(shipment, damaged={line.id: 2})
    api_client.force_authenticate(user=admin_user)

    order_data = api_client.get(f"/api/v1/admin/orders/{order.id}/").data["data"]
    listed = api_client.get("/api/v1/admin/orders/shipments/").data["data"]["results"]

    assert order_data["status"] == "shipped"  # never delivered with damaged units owed
    assert order_data["shipments"][0]["damaged_quantity"] == 2
    assert [row["damaged_quantity"] for row in listed if row["id"] == str(shipment.id)] == [2]


def test_status_change_response_keeps_the_lines(api_client, admin_user):
    order, _ = _confirmed(1)
    shipment = _ship(order, {order.lines.get(): 1})
    api_client.force_authenticate(user=admin_user)

    response = api_client.patch(
        f"/api/v1/admin/orders/shipments/{shipment.id}/status/",
        {"status": "in_transit"},
        format="json",
    )

    assert response.status_code == 200
    assert len(response.data["data"]["lines"]) == 1


def test_lists_do_not_query_per_shipment(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    def make_order():
        order, _ = _confirmed(2)
        line = order.lines.get()
        _ship(order, {line: 1})
        _ship(order, {line: 1})

    make_order()
    with CaptureQueriesContext(connection) as orders_small:
        api_client.get("/api/v1/admin/orders/")
    with CaptureQueriesContext(connection) as shipments_small:
        api_client.get("/api/v1/admin/orders/shipments/")
    for _ in range(3):
        make_order()
    with CaptureQueriesContext(connection) as orders_large:
        api_client.get("/api/v1/admin/orders/")
    with CaptureQueriesContext(connection) as shipments_large:
        api_client.get("/api/v1/admin/orders/shipments/")

    assert len(orders_large) == len(orders_small)
    assert len(shipments_large) == len(shipments_small)


# --- Replacing damaged units --------------------------------------------------------


def _damaged_order(quantity: int, damaged: int, *, spare: int = 0):
    """A received-back order with `damaged` units written off and `spare`
    unreserved units of the same variant on the shelf for replacement."""
    order, variant = _tight_order(quantity)
    line = order.lines.get()
    shipment = _cancelled(order, {line: quantity})
    _receive(shipment, damaged={line.id: damaged})
    if spare:
        record_movement(
            variant=variant,
            movement_type=MovementType.PURCHASE_IN,
            quantity=spare,
            unit_cost=Decimal("40"),
        )
    return order, variant, line, Shipment.objects.get(pk=shipment.pk)


def test_replacing_reserves_stock_and_frees_the_units_to_ship():
    order, variant, line, shipment = _damaged_order(3, damaged=1, spare=1)
    assert _stock(variant) == (3, 2)  # 2 sellable held + 1 spare

    replace_damaged_units(shipment=shipment)

    line.refresh_from_db()
    shipment_line = shipment.lines.get()
    assert _stock(variant) == (3, 3)  # the spare unit is now held as the replacement
    assert line.shippable_quantity == 3
    assert (shipment_line.damaged_quantity, shipment_line.replaced_quantity) == (1, 1)
    assert shipment_line.unresolved_damaged_quantity == 0
    assert _status(order) == SalesOrder.Status.CONFIRMED
    held = StockReservation.objects.filter(
        order_line=line, status=StockReservation.Status.ACTIVE
    ).aggregate(total=Sum("quantity"))["total"]
    assert held == 3


def test_replacement_ships_and_the_order_is_delivered():
    order, variant, line, shipment = _damaged_order(3, damaged=1, spare=1)
    replace_damaged_units(shipment=shipment)

    reshipment = _ship(order, {line: 3})
    update_shipment_status(shipment=reshipment, status=Shipment.Status.DELIVERED)

    assert _status(order) == SalesOrder.Status.DELIVERED
    assert _stock(variant) == (0, 0)
    assert not StockReservation.objects.filter(
        order_line=line, status=StockReservation.Status.ACTIVE
    ).exists()


def test_replacing_from_an_all_damaged_shipped_order_reopens_it():
    order, variant, _line, shipment = _damaged_order(2, damaged=2, spare=2)
    assert _status(order) == SalesOrder.Status.SHIPPED

    replace_damaged_units(shipment=shipment)

    assert _status(order) == SalesOrder.Status.CONFIRMED
    assert _stock(variant) == (2, 2)


def test_replacement_is_refused_without_enough_stock_and_changes_nothing():
    order, variant, line, shipment = _damaged_order(3, damaged=2, spare=1)
    before = (_stock(variant), _status(order))

    with pytest.raises(BusinessRuleViolationError) as exc:
        replace_damaged_units(shipment=shipment)

    assert exc.value.code == "insufficient_stock"
    assert variant.sku in exc.value.message
    line.refresh_from_db()
    assert (_stock(variant), _status(order)) == before
    assert line.shipped_quantity == 2
    assert shipment.lines.get().replaced_quantity == 0


def test_replacement_does_not_take_stock_reserved_for_another_order():
    _order, variant, _line, shipment = _damaged_order(2, damaged=1)
    other = get_or_create_cart(CustomerUserFactory())
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=1,
        unit_cost=Decimal("40"),
    )
    add_line(order=other, variant=variant, quantity=1)
    checkout(order=other)  # holds the only spare unit

    with pytest.raises(BusinessRuleViolationError) as exc:
        replace_damaged_units(shipment=shipment)

    assert exc.value.code == "insufficient_stock"


def test_nothing_left_to_replace_is_refused():
    _order, variant, _line, shipment = _damaged_order(2, damaged=1, spare=1)
    replace_damaged_units(shipment=shipment)
    stock = _stock(variant)

    with pytest.raises(BusinessRuleViolationError) as exc:
        replace_damaged_units(shipment=Shipment.objects.get(pk=shipment.pk))

    assert exc.value.code == "nothing_to_replace"
    assert _stock(variant) == stock


def test_a_shipment_without_damaged_units_has_nothing_to_replace():
    order, _ = _confirmed(1)
    shipment = _cancelled(order, {order.lines.get(): 1})
    _receive(shipment)

    with pytest.raises(BusinessRuleViolationError) as exc:
        replace_damaged_units(shipment=Shipment.objects.get(pk=shipment.pk))
    assert exc.value.code == "nothing_to_replace"


def test_replacement_requires_a_received_back_consignment():
    order, _ = _confirmed(1)
    shipment = _cancelled(order, {order.lines.get(): 1})

    with pytest.raises(BusinessRuleViolationError) as exc:
        replace_damaged_units(shipment=shipment)
    assert exc.value.code == "not_received_back"


def test_cancelling_after_a_replacement_releases_every_held_unit():
    order, variant, _line, shipment = _damaged_order(3, damaged=1, spare=1)
    replace_damaged_units(shipment=shipment)

    set_order_status(order=order, new_status=SalesOrder.Status.CANCELLED)

    assert _stock(variant) == (3, 0)


def test_replacement_posts_nothing_to_the_ledger():
    _order, variant, _line, shipment = _damaged_order(2, damaged=1, spare=1)
    journals = JournalEntry.objects.count()
    entries = StockLedgerEntry.objects.filter(variant=variant).count()

    replace_damaged_units(shipment=shipment)

    assert JournalEntry.objects.count() == journals
    assert StockLedgerEntry.objects.filter(variant=variant).count() == entries


def _replace_url(shipment) -> str:
    return f"/api/v1/admin/orders/shipments/{shipment.id}/replace-damaged/"


def test_replace_endpoint_returns_the_resolved_shipment(api_client, admin_user):
    _order, _, _, shipment = _damaged_order(2, damaged=1, spare=1)
    api_client.force_authenticate(user=admin_user)

    response = api_client.post(_replace_url(shipment))

    assert response.status_code == 200, response.data
    data = response.data["data"]
    assert (data["damaged_quantity"], data["unresolved_damaged_quantity"]) == (1, 0)
    assert data["lines"][0]["replaced_quantity"] == 1


def test_replace_endpoint_reports_missing_stock(api_client, admin_user):
    _order, _, _, shipment = _damaged_order(2, damaged=1)
    api_client.force_authenticate(user=admin_user)

    response = api_client.post(_replace_url(shipment))

    assert response.status_code == 400
    assert response.data["error"]["code"] == "insufficient_stock"


def test_replace_endpoint_requires_returns_manage(api_client, staff_user):
    _order, _, _, shipment = _damaged_order(2, damaged=1, spare=1)
    set_staff_permission(
        staff_user=staff_user, permission_code=StaffPermissionCode.ORDERS_MANAGE, is_enabled=True
    )
    api_client.force_authenticate(user=staff_user)
    assert api_client.post(_replace_url(shipment)).status_code == 403

    set_staff_permission(
        staff_user=staff_user, permission_code=StaffPermissionCode.RETURNS_MANAGE, is_enabled=True
    )
    assert api_client.post(_replace_url(shipment)).status_code == 200


def test_order_shows_damaged_units_as_resolved_after_replacement(api_client, admin_user):
    order, _, _, shipment = _damaged_order(2, damaged=2, spare=2)
    api_client.force_authenticate(user=admin_user)
    before = api_client.get(f"/api/v1/admin/orders/{order.id}/").data["data"]["shipments"][0]

    replace_damaged_units(shipment=shipment)
    after = api_client.get(f"/api/v1/admin/orders/{order.id}/").data["data"]["shipments"][0]

    assert before["unresolved_damaged_quantity"] == 2
    assert (after["damaged_quantity"], after["unresolved_damaged_quantity"]) == (2, 0)
