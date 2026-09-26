from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounting.constants import ACCOUNT_CODES
from apps.accounting.models import JournalEntry
from apps.accounting.selectors.reports import balance_sheet, inventory_valuation
from apps.accounting.tests.helpers import seed_chart_of_accounts
from apps.accounts.factories import CustomerUserFactory
from apps.catalog.factories import ProductVariantFactory
from apps.inventory.services.stock import post_adjustment, write_off_stock
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.payments import capture_payment
from apps.orders.services.shipments import create_shipment
from apps.procurement.factories import SupplierFactory
from apps.procurement.models import GRNLine
from apps.procurement.services.goods_receipt import create_goods_receipt
from apps.procurement.services.purchase_orders import create_purchase_order, submit_purchase_order
from apps.procurement.services.vendor_bills import create_vendor_bill, record_vendor_payment

pytestmark = pytest.mark.django_db


def _receive_stock(*, variant, supplier, quantity: int, unit_cost: Decimal):
    po = create_purchase_order(
        supplier=supplier,
        order_date=date.today(),
        lines=[{"variant": variant, "quantity_ordered": quantity, "unit_cost": unit_cost}],
    )
    po = submit_purchase_order(purchase_order=po)
    create_goods_receipt(
        purchase_order=po,
        received_date=date.today(),
        received_by=None,
        lines=[
            {
                "purchase_order_line": po.lines.get(),
                "quantity_received": quantity,
                "condition": GRNLine.Condition.ACCEPTED,
            }
        ],
    )
    return po


def test_balance_sheet_identity_holds_with_accumulated_earnings():
    seed_chart_of_accounts()

    variant = ProductVariantFactory(price=Decimal("50.00"))
    supplier = SupplierFactory()
    customer = CustomerUserFactory()

    po = _receive_stock(
        variant=variant,
        supplier=supplier,
        quantity=50,
        unit_cost=Decimal("4.00"),
    )
    bill = create_vendor_bill(
        purchase_order=po, supplier=supplier, amount=Decimal("200.00"), due_date=date.today()
    )
    record_vendor_payment(vendor_bill=bill, amount=Decimal("200.00"), paid_at=timezone.now())

    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=10)
    checkout(order=cart)
    capture_payment(order=cart, amount=cart.grand_total)
    create_shipment(order=cart, lines=[{"order_line": cart.lines.get(), "quantity": 10}])
    write_off_stock(variant=variant, quantity=2, reason="Damaged")

    sheet = balance_sheet(as_of=date.today() + timedelta(days=1))

    assert sheet["retained_earnings"] != Decimal("0")
    assert sheet["equity"] == sheet["contributed_equity"] + sheet["retained_earnings"]
    assert sheet["assets"] - (sheet["liabilities"] + sheet["equity"]) == Decimal("0")


def test_stock_adjustment_keeps_gl_inventory_equal_to_physical_valuation():
    seed_chart_of_accounts()

    variant = ProductVariantFactory()
    supplier = SupplierFactory()
    _receive_stock(
        variant=variant,
        supplier=supplier,
        quantity=50,
        unit_cost=Decimal("4.00"),
    )
    as_of = date.today() + timedelta(days=1)
    assert balance_sheet(as_of=as_of)["inventory_asset"] == inventory_valuation()

    increase = post_adjustment(variant=variant, quantity_delta=10, unit_cost=Decimal("4.00"))
    assert balance_sheet(as_of=as_of)["inventory_asset"] == inventory_valuation() == Decimal("240")

    decrease = post_adjustment(variant=variant, quantity_delta=-5)
    assert balance_sheet(as_of=as_of)["inventory_asset"] == inventory_valuation() == Decimal("220")

    entries = list(
        JournalEntry.objects.filter(
            reference_type="stock_adjustment", reference_id__in=[increase.id, decrease.id]
        )
    )
    assert len(entries) == 2
    for entry in entries:
        lines = list(entry.lines.all())
        debits = sum((line.debit for line in lines), Decimal("0"))
        credits = sum((line.credit for line in lines), Decimal("0"))
        assert debits == credits > Decimal("0")

    inventory_code = ACCOUNT_CODES["inventory_asset"]
    increase_entry = JournalEntry.objects.get(reference_id=increase.id)
    decrease_entry = JournalEntry.objects.get(reference_id=decrease.id)
    assert increase_entry.lines.get(account__code=inventory_code).debit == Decimal("40.00")
    assert decrease_entry.lines.get(account__code=inventory_code).credit == Decimal("20.00")


def test_balance_sheet_identity_survives_a_stock_adjustment():
    seed_chart_of_accounts()

    variant = ProductVariantFactory()
    supplier = SupplierFactory()
    _receive_stock(
        variant=variant,
        supplier=supplier,
        quantity=20,
        unit_cost=Decimal("3.00"),
    )
    post_adjustment(variant=variant, quantity_delta=-4)

    sheet = balance_sheet(as_of=date.today() + timedelta(days=1))
    assert sheet["assets"] - (sheet["liabilities"] + sheet["equity"]) == Decimal("0")
