from __future__ import annotations

from decimal import Decimal

import pytest
from django.db.models import Sum

from apps.accounting.models import JournalEntryLine
from apps.accounting.tests.helpers import seed_chart_of_accounts
from apps.catalog.factories import ProductVariantFactory
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.selectors.stock import get_stock_item
from apps.inventory.services.stock import (
    post_adjustment,
    record_movement,
    release_reservation,
    reserve_stock,
    write_off_stock,
)

pytestmark = pytest.mark.django_db


def test_purchase_receipt_updates_on_hand_and_weighted_average_cost():
    variant = ProductVariantFactory()

    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=40,
        unit_cost=Decimal("8.00"),
    )
    entry = record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=60,
        unit_cost=Decimal("9.50"),
    )

    stock_item = get_stock_item(variant=variant)
    assert stock_item.quantity_on_hand == 100
    assert stock_item.avg_cost == Decimal("8.9000")
    assert entry.balance_after == 100


def test_sales_shipment_rejected_when_insufficient_stock():
    variant = ProductVariantFactory()
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=5,
        unit_cost=Decimal("8.00"),
    )

    with pytest.raises(BusinessRuleViolationError):
        record_movement(
            variant=variant,
            movement_type=MovementType.SALES_OUT,
            quantity=10,
        )

    stock_item = get_stock_item(variant=variant)
    assert stock_item.quantity_on_hand == 5


def test_sales_shipment_reduces_on_hand_without_touching_avg_cost():
    variant = ProductVariantFactory()
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=20,
        unit_cost=Decimal("8.90"),
    )

    record_movement(
        variant=variant,
        movement_type=MovementType.SALES_OUT,
        quantity=10,
    )

    stock_item = get_stock_item(variant=variant)
    assert stock_item.quantity_on_hand == 10
    assert stock_item.avg_cost == Decimal("8.90")


def test_post_adjustment_positive_and_negative_delta():
    seed_chart_of_accounts()
    variant = ProductVariantFactory()
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("5.00"),
    )

    entry = post_adjustment(variant=variant, quantity_delta=5)
    assert entry.movement_type == MovementType.ADJUSTMENT_IN
    assert entry.balance_after == 15

    entry = post_adjustment(variant=variant, quantity_delta=-3)
    assert entry.movement_type == MovementType.ADJUSTMENT_OUT
    assert entry.balance_after == 12

    with pytest.raises(BusinessRuleViolationError):
        post_adjustment(variant=variant, quantity_delta=0)


def test_record_movement_rejects_non_positive_quantity():
    variant = ProductVariantFactory()

    with pytest.raises(BusinessRuleViolationError):
        record_movement(
            variant=variant,
            movement_type=MovementType.PURCHASE_IN,
            quantity=0,
        )


def test_reserve_stock_moves_available_to_reserved():
    variant = ProductVariantFactory()
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("5.00"),
    )

    stock_item = reserve_stock(variant=variant, quantity=4)

    assert stock_item.quantity_on_hand == 10
    assert stock_item.quantity_reserved == 4
    assert stock_item.available == 6


def test_reserve_stock_rejects_when_not_enough_available():
    variant = ProductVariantFactory()
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=3,
        unit_cost=Decimal("5.00"),
    )

    with pytest.raises(BusinessRuleViolationError):
        reserve_stock(variant=variant, quantity=4)


def test_release_reservation_cannot_exceed_reserved_quantity():
    variant = ProductVariantFactory()
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("5.00"),
    )
    reserve_stock(variant=variant, quantity=4)

    stock_item = release_reservation(variant=variant, quantity=4)
    assert stock_item.quantity_reserved == 0

    with pytest.raises(BusinessRuleViolationError):
        release_reservation(variant=variant, quantity=1)


def test_write_off_stock_posts_ledger_and_shrinkage_journal():
    seed_chart_of_accounts()
    variant = ProductVariantFactory()
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("5.00"),
    )

    entry = write_off_stock(variant=variant, quantity=3, reason="Damaged")

    assert entry.movement_type == MovementType.WRITE_OFF
    assert entry.notes == "Damaged"
    stock_item = get_stock_item(variant=variant)
    assert stock_item.quantity_on_hand == 7

    lines = JournalEntryLine.objects.filter(journal_entry__reference_type="stock_writeoff")
    assert lines.count() == 2
    totals = lines.aggregate(debit=Sum("debit"), credit=Sum("credit"))
    assert totals["debit"] == totals["credit"] == Decimal("15.00")


def test_write_off_stock_rejects_when_not_enough_on_hand():
    seed_chart_of_accounts()
    variant = ProductVariantFactory()

    with pytest.raises(BusinessRuleViolationError):
        write_off_stock(variant=variant, quantity=1)


def test_stock_status_summary_counts_all_six_buckets():
    seed_chart_of_accounts()
    from datetime import date

    from apps.inventory.selectors.stock_status import stock_status_summary
    from apps.orders.factories import SalesOrderFactory, SalesOrderLineFactory
    from apps.orders.models import ReturnRMA, ReturnRMALine, SalesOrder
    from apps.procurement.factories import SupplierFactory
    from apps.procurement.models import GRNLine
    from apps.procurement.services.goods_receipt import create_goods_receipt
    from apps.procurement.services.purchase_orders import (
        create_purchase_order,
        submit_purchase_order,
    )

    variant = ProductVariantFactory()
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("5.00"),
    )

    reserve_stock(variant=variant, quantity=3)
    write_off_stock(variant=variant, quantity=2, reason="Expired")

    supplier = SupplierFactory()
    po = create_purchase_order(
        supplier=supplier,
        order_date=date.today(),
        lines=[{"variant": variant, "quantity_ordered": 5, "unit_cost": Decimal("4.00")}],
    )
    po = submit_purchase_order(purchase_order=po)
    po_line = po.lines.get()
    create_goods_receipt(
        purchase_order=po,
        received_date=date.today(),
        received_by=None,
        lines=[
            {
                "purchase_order_line": po_line,
                "quantity_received": 2,
                "condition": GRNLine.Condition.REJECTED,
            }
        ],
    )

    order = SalesOrderFactory(status=SalesOrder.Status.SHIPPED)
    order_line = SalesOrderLineFactory(order=order, variant=variant, quantity=4)
    rma = ReturnRMA.objects.create(
        order=order, rma_number="RMA-STATUS", status=ReturnRMA.Status.RECEIVED
    )
    ReturnRMALine.objects.create(rma=rma, order_line=order_line, quantity=4)

    summary = stock_status_summary()

    assert summary["sellable"] == 5
    assert summary["reserved"] == 3
    assert summary["in_transit"] == 0
    assert summary["quarantine"] == 2
    assert summary["pending_return_inspection"] == 4
    assert summary["written_off"] == 2
