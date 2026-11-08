"""Stock in any warehouse sells: checkout holds it where it is (the default
warehouse first, split only when no one warehouse has enough), every release
and stock-out hits the warehouse that holds it, and what comes back goes back
where it left from."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from apps.accounting.constants import ACCOUNT_CODES
from apps.accounting.models import JournalEntryLine
from apps.accounting.selectors.reports import inventory_ledger_check
from apps.accounts.factories import CustomerUserFactory
from apps.catalog.factories import ProductVariantFactory
from apps.catalog.models import Category
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.models import StockItem, StockLedgerEntry
from apps.inventory.selectors.stock import (
    available_quantity_for_variant,
    get_stock_item,
    reorder_points_for_variants,
)
from apps.inventory.selectors.warehouse import get_or_create_default_warehouse
from apps.inventory.services.stock import record_movement
from apps.inventory.services.warehouses import create_warehouse, update_warehouse
from apps.orders.models import ReturnRMALine, Shipment, StockReservation
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.orders import cancel_order
from apps.orders.services.payments import capture_payment
from apps.orders.services.reservations import (
    release_reservation_by_staff,
    release_stock_reservation,
)
from apps.orders.services.returns import approve_rma, create_rma, grade_rma_line, receive_rma
from apps.orders.services.shipments import (
    create_shipment,
    receive_back_shipment,
    update_shipment_status,
)
from apps.procurement.models import GRNLine
from apps.procurement.services.goods_receipt import create_goods_receipt
from apps.procurement.services.purchase_orders import create_purchase_order, submit_purchase_order

pytestmark = pytest.mark.django_db

STOCK = Category.CategoryType.STOCK


@pytest.fixture
def main():
    return get_or_create_default_warehouse()


@pytest.fixture
def branch(main):
    return create_warehouse(data={"name": "Branch", "code": "BR", "kind": STOCK})


def _receive(variant, warehouse, quantity, unit_cost="40"):
    record_movement(
        variant=variant,
        warehouse=warehouse,
        movement_type=MovementType.PURCHASE_IN,
        quantity=quantity,
        unit_cost=Decimal(unit_cost),
    )


def _held(variant, warehouse) -> tuple[int, int]:
    item = get_stock_item(variant=variant, warehouse=warehouse)
    return (item.quantity_on_hand, item.quantity_reserved) if item else (0, 0)


def _order(variant, quantity, *, confirm=True):
    order = get_or_create_cart(CustomerUserFactory())
    add_line(order=order, variant=variant, quantity=quantity)
    checkout(order=order)
    order.refresh_from_db()
    if confirm:
        capture_payment(order=order, amount=order.grand_total)
        order.refresh_from_db()
    return order


def _holds(order) -> list[tuple]:
    return sorted(
        (row.warehouse.code, row.quantity, row.shipped_quantity)
        for row in StockReservation.objects.filter(
            order_line__order=order, status=StockReservation.Status.ACTIVE
        ).select_related("warehouse")
    )


def test_storefront_counts_stock_in_every_active_warehouse(main, branch):
    variant = ProductVariantFactory()
    _receive(variant, main, 2)
    _receive(variant, branch, 5)

    assert available_quantity_for_variant(variant) == 7

    branch.is_active = False
    branch.save(update_fields=["is_active"])
    assert available_quantity_for_variant(variant) == 2


def test_checkout_holds_stock_in_another_warehouse_when_the_default_is_empty(main, branch):
    variant = ProductVariantFactory()
    _receive(variant, branch, 5)

    order = _order(variant, 3)

    assert _holds(order) == [("BR", 3, 0)]
    assert _held(variant, branch) == (5, 3)
    assert _held(variant, main) == (0, 0)


def test_the_default_warehouse_goes_first_when_it_can_cover_the_order(main, branch):
    variant = ProductVariantFactory()
    _receive(variant, main, 4)
    _receive(variant, branch, 10)

    order = _order(variant, 3)

    assert _holds(order) == [("MAIN", 3, 0)]


def test_one_warehouse_takes_the_whole_line_when_it_can(main, branch):
    variant = ProductVariantFactory()
    _receive(variant, main, 2)
    _receive(variant, branch, 10)

    order = _order(variant, 5)

    assert _holds(order) == [("BR", 5, 0)]


def test_a_line_no_single_warehouse_covers_is_split(main, branch):
    variant = ProductVariantFactory()
    _receive(variant, main, 3)
    _receive(variant, branch, 4)

    order = _order(variant, 6)

    assert _holds(order) == [("BR", 3, 0), ("MAIN", 3, 0)]
    assert _held(variant, main) == (3, 3)
    assert _held(variant, branch) == (4, 3)


def test_checkout_is_refused_when_every_warehouse_together_falls_short(main, branch):
    variant = ProductVariantFactory()
    _receive(variant, main, 1)
    _receive(variant, branch, 1)

    with pytest.raises(BusinessRuleViolationError) as exc:
        _order(variant, 3)
    assert exc.value.code == "insufficient_stock"
    assert _held(variant, main) == (1, 0)
    assert _held(variant, branch) == (1, 0)


def test_an_inactive_warehouse_is_never_held_from(main, branch):
    variant = ProductVariantFactory()
    _receive(variant, branch, 5)
    branch.is_active = False
    branch.save(update_fields=["is_active"])

    with pytest.raises(BusinessRuleViolationError) as exc:
        _order(variant, 1)
    assert exc.value.code == "insufficient_stock"


def test_cancelling_releases_each_warehouse_it_held_from(main, branch):
    variant = ProductVariantFactory()
    _receive(variant, main, 3)
    _receive(variant, branch, 4)
    order = _order(variant, 6)

    cancel_order(order=order)

    assert _held(variant, main) == (3, 0)
    assert _held(variant, branch) == (4, 0)


def test_shipping_takes_each_unit_out_of_the_warehouse_that_holds_it(main, branch):
    variant = ProductVariantFactory()
    _receive(variant, main, 3)
    _receive(variant, branch, 4)
    order = _order(variant, 6)
    line = order.lines.get()

    # The default warehouse's hold was made first, so it ships first.
    create_shipment(order=order, lines=[{"order_line": line, "quantity": 4}])
    assert _held(variant, main) == (0, 0)
    assert _held(variant, branch) == (3, 2)

    create_shipment(order=order, lines=[{"order_line": line, "quantity": 2}])
    assert _held(variant, main) == (0, 0)
    assert _held(variant, branch) == (1, 0)
    outs = StockLedgerEntry.objects.filter(variant=variant, movement_type=MovementType.SALES_OUT)
    assert sum(entry.quantity for entry in outs.filter(warehouse=main)) == 3
    assert sum(entry.quantity for entry in outs.filter(warehouse=branch)) == 3


def test_cost_of_goods_sold_uses_the_cost_of_the_warehouse_shipped_from(main, branch):
    variant = ProductVariantFactory()
    _receive(variant, branch, 5, unit_cost="25")
    order = _order(variant, 2)

    shipment = create_shipment(
        order=order, lines=[{"order_line": order.lines.get(), "quantity": 2}]
    )

    cogs = JournalEntryLine.objects.get(
        journal_entry__reference_id=shipment.id, account__code=ACCOUNT_CODES["cogs"]
    )
    assert cogs.debit == Decimal("50.00")


def test_a_parcel_received_back_returns_to_the_warehouse_it_left(main, branch):
    variant = ProductVariantFactory()
    _receive(variant, branch, 5)
    order = _order(variant, 2)
    line = order.lines.get()
    shipment = create_shipment(order=order, lines=[{"order_line": line, "quantity": 2}])
    update_shipment_status(shipment=shipment, status=Shipment.Status.CANCELLED)

    receive_back_shipment(
        shipment=shipment,
        dispositions={shipment.lines.get().id: {"sellable": 1, "damaged": 1}},
    )

    # Both units came back in, the damaged one was written off, the sellable
    # one is held again for the order in the same warehouse.
    assert _held(variant, branch) == (4, 1)
    assert _held(variant, main) == (0, 0)
    assert _holds(order) == [("BR", 1, 0)]


def test_a_customer_return_restocks_the_warehouse_it_shipped_from(main, branch):
    variant = ProductVariantFactory()
    _receive(variant, branch, 5)
    order = _order(variant, 2)
    line = order.lines.get()
    shipment = create_shipment(order=order, lines=[{"order_line": line, "quantity": 2}])
    update_shipment_status(shipment=shipment, status=Shipment.Status.DELIVERED)

    rma = create_rma(order=order, lines=[{"order_line": line, "quantity": 1}])
    approve_rma(rma=rma)
    grade_rma_line(line=rma.lines.get(), condition=ReturnRMALine.Condition.SELLABLE)
    receive_rma(rma=rma)

    assert _held(variant, branch) == (4, 0)
    assert _held(variant, main) == (0, 0)


def test_goods_are_received_into_the_chosen_warehouse(main, branch):
    from apps.procurement.factories import SupplierFactory

    variant = ProductVariantFactory()
    po = create_purchase_order(
        supplier=SupplierFactory(),
        order_date=date.today(),
        lines=[{"variant": variant, "quantity_ordered": 5, "unit_cost": Decimal("4.00")}],
    )
    po = submit_purchase_order(purchase_order=po)

    grn = create_goods_receipt(
        purchase_order=po,
        received_date=date.today(),
        received_by=None,
        warehouse=branch,
        lines=[
            {
                "purchase_order_line": po.lines.get(),
                "quantity_received": 5,
                "condition": GRNLine.Condition.ACCEPTED,
            }
        ],
    )

    assert grn.warehouse == branch
    assert _held(variant, branch) == (5, 0)
    assert _held(variant, main) == (0, 0)


def test_goods_cannot_be_received_into_an_inactive_warehouse(main, branch):
    from apps.procurement.factories import SupplierFactory

    variant = ProductVariantFactory()
    po = submit_purchase_order(
        purchase_order=create_purchase_order(
            supplier=SupplierFactory(),
            order_date=date.today(),
            lines=[{"variant": variant, "quantity_ordered": 5, "unit_cost": Decimal("4.00")}],
        )
    )
    branch.is_active = False
    branch.save(update_fields=["is_active"])

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_goods_receipt(
            purchase_order=po,
            received_date=date.today(),
            received_by=None,
            warehouse=branch,
            lines=[
                {
                    "purchase_order_line": po.lines.get(),
                    "quantity_received": 5,
                    "condition": GRNLine.Condition.ACCEPTED,
                }
            ],
        )
    assert exc.value.code == "warehouse_kind_mismatch"


def test_shipping_after_a_hold_was_released_never_takes_another_orders_hold(main):
    """Staff released order A's hold by hand; shipping A must hold free stock
    again, not consume the unit B is holding."""
    variant = ProductVariantFactory()
    _receive(variant, main, 3)
    a = _order(variant, 1)
    _order(variant, 1)  # B
    release_stock_reservation(reservation=StockReservation.objects.get(order_line__order=a))

    create_shipment(order=a, lines=[{"order_line": a.lines.get(), "quantity": 1}])

    # 3 - 1 shipped; B still holds its unit.
    assert _held(variant, main) == (2, 1)


def test_shipping_after_a_hold_was_released_is_refused_without_free_stock(main):
    variant = ProductVariantFactory()
    _receive(variant, main, 2)
    a = _order(variant, 1)
    _order(variant, 1)  # B takes the other unit
    release_stock_reservation(reservation=StockReservation.objects.get(order_line__order=a))
    _order(variant, 1)  # C takes the unit A let go

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_shipment(order=a, lines=[{"order_line": a.lines.get(), "quantity": 1}])
    assert exc.value.code == "insufficient_stock"
    assert _held(variant, main) == (2, 2)


def test_a_parcel_comes_back_into_a_warehouse_switched_off_after_it_shipped(main, branch):
    variant = ProductVariantFactory()
    _receive(variant, branch, 1)
    order = _order(variant, 1)
    shipment = create_shipment(
        order=order, lines=[{"order_line": order.lines.get(), "quantity": 1}]
    )
    update_shipment_status(shipment=shipment, status=Shipment.Status.CANCELLED)
    update_warehouse(warehouse=branch, data={"is_active": False})

    receive_back_shipment(
        shipment=shipment, dispositions={shipment.lines.get().id: {"sellable": 1, "damaged": 0}}
    )

    # Back on Branch's shelf and held there for the order again.
    assert _held(variant, branch) == (1, 1)


def test_a_return_is_booked_at_the_cost_of_the_warehouse_it_rejoins(main, branch):
    """Branch's units cost more than Main's; a unit returned to Main adds Main's
    cost to stock, so the books must add the same, not the shop-wide average."""
    variant = ProductVariantFactory()
    _receive(variant, main, 10, unit_cost="100")
    _receive(variant, branch, 1, unit_cost="300")
    order = _order(variant, 11)
    line = order.lines.get()
    shipment = create_shipment(order=order, lines=[{"order_line": line, "quantity": 11}])
    update_shipment_status(shipment=shipment, status=Shipment.Status.DELIVERED)
    _receive(variant, main, 10, unit_cost="100")
    before = inventory_ledger_check(kind=Category.CategoryType.STOCK)["ledger_difference"]

    rma = create_rma(order=order, lines=[{"order_line": line, "quantity": 1}])
    approve_rma(rma=rma)
    grade_rma_line(line=rma.lines.get(), condition=ReturnRMALine.Condition.SELLABLE)
    receive_rma(rma=rma)

    after = inventory_ledger_check(kind=Category.CategoryType.STOCK)["ledger_difference"]
    assert after == before


def test_a_parcel_received_back_after_the_cost_moved_keeps_books_equal_to_stock(main):
    """Shipped at 100, then Main restocked at 200: the unit comes back at the
    100 the shipment charged to COGS, so stock and books gain the same."""
    variant = ProductVariantFactory()
    _receive(variant, main, 1, unit_cost="100")
    order = _order(variant, 1)
    shipment = create_shipment(
        order=order, lines=[{"order_line": order.lines.get(), "quantity": 1}]
    )
    update_shipment_status(shipment=shipment, status=Shipment.Status.CANCELLED)
    _receive(variant, main, 1, unit_cost="200")
    before = inventory_ledger_check(kind=Category.CategoryType.STOCK)["ledger_difference"]

    receive_back_shipment(
        shipment=shipment, dispositions={shipment.lines.get().id: {"sellable": 1, "damaged": 0}}
    )

    after = inventory_ledger_check(kind=Category.CategoryType.STOCK)["ledger_difference"]
    assert after == before
    assert get_stock_item(variant=variant, warehouse=main).avg_cost == Decimal("150")


def test_staff_cannot_release_a_confirmed_orders_hold(main):
    variant = ProductVariantFactory()
    _receive(variant, main, 1)
    order = _order(variant, 1)

    with pytest.raises(BusinessRuleViolationError) as exc:
        release_reservation_by_staff(
            reservation=StockReservation.objects.get(order_line__order=order)
        )
    assert exc.value.code == "reservation_promised"
    assert _held(variant, main) == (1, 1)


def test_staff_can_release_an_unpaid_orders_hold(main):
    variant = ProductVariantFactory()
    _receive(variant, main, 1)
    order = _order(variant, 1, confirm=False)

    release_reservation_by_staff(reservation=StockReservation.objects.get(order_line__order=order))
    assert _held(variant, main) == (1, 0)


def test_the_reorder_point_covers_the_warehouses_the_stock_count_covers(main, branch):
    variant = ProductVariantFactory()
    _receive(variant, main, 1)
    _receive(variant, branch, 1)
    StockItem.objects.filter(variant=variant, warehouse=main).update(reorder_point=3)
    StockItem.objects.filter(variant=variant, warehouse=branch).update(reorder_point=4)

    assert reorder_points_for_variants([variant.id]) == {variant.id: 7}
    assert reorder_points_for_variants([variant.id], main) == {variant.id: 3}


def test_deleting_a_product_does_not_bring_back_deleted_stock_records(main, branch):
    from apps.catalog.services.products import delete_product

    variant = ProductVariantFactory()
    StockItem.objects.filter(variant=variant, warehouse=branch).delete()

    delete_product(product=variant.product)
    assert not StockItem.objects.filter(variant=variant, warehouse=branch).exists()
