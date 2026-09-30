from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.db.models import Sum
from django.utils import timezone

from apps.accounting.constants import ACCOUNT_CODES
from apps.accounting.models import JournalEntry, JournalEntryLine
from apps.accounting.selectors.reports import balance_sheet, inventory_valuation
from apps.accounting.tests.helpers import seed_chart_of_accounts
from apps.accounts.factories import CustomerUserFactory
from apps.catalog.factories import ProductVariantFactory
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.orders.factories import CouponFactory
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.coupons import apply_coupon
from apps.orders.services.payments import capture_payment, refund_payment
from apps.orders.services.shipments import create_shipment
from apps.procurement.factories import SupplierFactory
from apps.procurement.models import GRNLine
from apps.procurement.services.goods_receipt import create_goods_receipt
from apps.procurement.services.purchase_orders import create_purchase_order, submit_purchase_order
from apps.procurement.services.vendor_bills import create_vendor_bill, record_vendor_payment

pytestmark = pytest.mark.django_db


def test_full_procure_to_pay_and_order_to_cash_ledger_stays_balanced():
    seed_chart_of_accounts()

    variant = ProductVariantFactory()
    supplier = SupplierFactory()
    customer = CustomerUserFactory()

    # Procure-to-pay
    po = create_purchase_order(
        supplier=supplier,
        order_date=date.today(),
        lines=[{"variant": variant, "quantity_ordered": 50, "unit_cost": Decimal("4.00")}],
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
                "quantity_received": 50,
                "condition": GRNLine.Condition.ACCEPTED,
            }
        ],
    )
    bill = create_vendor_bill(
        purchase_order=po, supplier=supplier, amount=Decimal("200.00"), due_date=date.today()
    )
    record_vendor_payment(vendor_bill=bill, amount=Decimal("200.00"), paid_at=timezone.now())

    # Order-to-cash
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=10)
    checkout(order=cart)
    payment = capture_payment(order=cart, amount=cart.grand_total)
    order_line = cart.lines.get()
    create_shipment(order=cart, lines=[{"order_line": order_line, "quantity": 10}])
    refund_payment(payment=payment)

    totals = JournalEntryLine.objects.aggregate(debit=Sum("debit"), credit=Sum("credit"))
    assert totals["debit"] == totals["credit"]

    sheet = balance_sheet(as_of=date.today() + timedelta(days=1))
    assert sheet["inventory_asset"] == inventory_valuation()


def test_shipment_revenue_posting_includes_shipping_charge():
    """capture_payment credits AR for grand_total (incl. shipping); the
    shipment's revenue entry must debit AR for the same total or AR never
    clears to zero for a paid, delivered order."""
    seed_chart_of_accounts()

    variant = ProductVariantFactory()
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("5.00"),
    )

    customer = CustomerUserFactory()
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=1)
    checkout(order=cart)
    cart.shipping_total = Decimal("70.00")
    cart.save(update_fields=["shipping_total"])
    cart.recalculate_totals()
    capture_payment(order=cart, amount=cart.grand_total)
    order_line = cart.lines.get()
    create_shipment(
        order=cart,
        lines=[{"order_line": order_line, "quantity": 1}],
        shipping_charge=Decimal("70.00"),
    )

    ar_account_id = ACCOUNT_CODES["accounts_receivable"]
    ar_balance = JournalEntryLine.objects.filter(account__code=ar_account_id).aggregate(
        debit=Sum("debit"), credit=Sum("credit")
    )
    assert (ar_balance["debit"] or Decimal("0")) == (ar_balance["credit"] or Decimal("0"))

    totals = JournalEntryLine.objects.aggregate(debit=Sum("debit"), credit=Sum("credit"))
    assert totals["debit"] == totals["credit"]


def test_shipment_revenue_posting_uses_order_shipping_total_when_admin_omits_it():
    """create_shipment's shipping_charge is an optional, per-shipment admin
    field that defaults to 0 — the posting must fall back to the order's own
    shipping_total (what the customer was actually charged) rather than
    silently dropping shipping revenue whenever an admin leaves it unset."""
    seed_chart_of_accounts()

    variant = ProductVariantFactory()
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("5.00"),
    )

    customer = CustomerUserFactory()
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=1)
    checkout(order=cart)
    cart.shipping_total = Decimal("70.00")
    cart.save(update_fields=["shipping_total"])
    cart.recalculate_totals()
    capture_payment(order=cart, amount=cart.grand_total)
    order_line = cart.lines.get()

    # Deliberately no shipping_charge kwarg — this is the common admin path.
    create_shipment(order=cart, lines=[{"order_line": order_line, "quantity": 1}])

    ar_balance = JournalEntryLine.objects.filter(
        account__code=ACCOUNT_CODES["accounts_receivable"]
    ).aggregate(debit=Sum("debit"), credit=Sum("credit"))
    assert (ar_balance["debit"] or Decimal("0")) == (ar_balance["credit"] or Decimal("0"))

    revenue_credit = JournalEntryLine.objects.filter(
        account__code=ACCOUNT_CODES["revenue"]
    ).aggregate(credit=Sum("credit"))["credit"]
    assert revenue_credit == cart.subtotal + cart.shipping_total


def test_shipment_revenue_posting_for_a_normal_order():
    """Baseline: an undiscounted order's shipment revenue equals the plain
    line total — the discount-ratio math must be a no-op with no discount."""
    seed_chart_of_accounts()

    variant = ProductVariantFactory(price=Decimal("50.00"))
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("5.00"),
    )
    customer = CustomerUserFactory()
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=2)
    checkout(order=cart)
    capture_payment(order=cart, amount=cart.grand_total)
    order_line = cart.lines.get()

    create_shipment(order=cart, lines=[{"order_line": order_line, "quantity": 2}])

    revenue_credit = JournalEntryLine.objects.filter(
        account__code=ACCOUNT_CODES["revenue"]
    ).aggregate(credit=Sum("credit"))["credit"]
    assert revenue_credit == Decimal("100.00")  # 50.00 * 2, no discount


def test_shipment_revenue_posting_on_a_discounted_order():
    """An order-level coupon discounts the whole order, not any one line —
    unit_price on the line stays the pre-discount price. Shipment revenue
    must recognize the same discounted rate the customer actually paid,
    not the full pre-discount line amount."""
    seed_chart_of_accounts()

    variant = ProductVariantFactory(price=Decimal("50.00"))
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("5.00"),
    )
    customer = CustomerUserFactory()
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=4)
    coupon = CouponFactory()  # 10% off, per CouponFactory's default
    apply_coupon(order=cart, code=coupon.code)
    cart.refresh_from_db()
    checkout(order=cart)
    capture_payment(order=cart, amount=cart.grand_total)
    order_line = cart.lines.get()

    create_shipment(order=cart, lines=[{"order_line": order_line, "quantity": 4}])

    revenue_credit = JournalEntryLine.objects.filter(
        account__code=ACCOUNT_CODES["revenue"]
    ).aggregate(credit=Sum("credit"))["credit"]
    assert revenue_credit == Decimal("180.00")  # (50.00 * 4) less 10%

    ar_balance = JournalEntryLine.objects.filter(
        account__code=ACCOUNT_CODES["accounts_receivable"]
    ).aggregate(debit=Sum("debit"), credit=Sum("credit"))
    assert (ar_balance["debit"] or Decimal("0")) == (ar_balance["credit"] or Decimal("0"))


def test_shipment_revenue_posting_on_a_discounted_partial_shipment():
    """A partial shipment of a discounted order recognizes revenue only for
    the shipped share, at the same discounted rate the whole order was
    charged — not the undiscounted rate, and not the full order's discount
    applied against a partial quantity."""
    seed_chart_of_accounts()

    variant = ProductVariantFactory(price=Decimal("50.00"))
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("5.00"),
    )
    customer = CustomerUserFactory()
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=4)
    coupon = CouponFactory()
    apply_coupon(order=cart, code=coupon.code)
    cart.refresh_from_db()
    checkout(order=cart)
    capture_payment(order=cart, amount=cart.grand_total)
    order_line = cart.lines.get()

    create_shipment(order=cart, lines=[{"order_line": order_line, "quantity": 2}])

    revenue_credit = JournalEntryLine.objects.filter(
        account__code=ACCOUNT_CODES["revenue"]
    ).aggregate(credit=Sum("credit"))["credit"]
    assert revenue_credit == Decimal("90.00")  # (50.00 * 2) less 10%

    # AR only nets to zero once the whole order has shipped — capture_payment
    # already credited AR for the full discounted grand_total, and only half
    # the units have shipped, so a debit balance of 90.00 is still expected.
    ar_balance = JournalEntryLine.objects.filter(
        account__code=ACCOUNT_CODES["accounts_receivable"]
    ).aggregate(debit=Sum("debit"), credit=Sum("credit"))
    outstanding = (ar_balance["credit"] or Decimal("0")) - (ar_balance["debit"] or Decimal("0"))
    assert outstanding == Decimal("90.00")


def test_customer_refund_posts_to_refund_payable():
    seed_chart_of_accounts()

    variant = ProductVariantFactory()
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("5.00"),
    )

    customer = CustomerUserFactory()
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=1)
    checkout(order=cart)
    payment = capture_payment(order=cart, amount=cart.grand_total)

    refund_payment(payment=payment)

    entry = JournalEntry.objects.get(reference_type="customer_refund")
    refund_line = entry.lines.get(account__code=ACCOUNT_CODES["refund_payable"])
    bank_line = entry.lines.get(account__code=ACCOUNT_CODES["bank"])
    assert refund_line.debit == payment.amount
    assert bank_line.credit == payment.amount
