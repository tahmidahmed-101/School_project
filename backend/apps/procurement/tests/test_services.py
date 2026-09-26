from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounting.constants import ACCOUNT_CODES
from apps.accounting.models import JournalEntry, JournalEntryLine
from apps.catalog.factories import ProductVariantFactory
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.selectors.stock import get_stock_item
from apps.procurement.factories import PurchaseOrderFactory, SupplierFactory
from apps.procurement.models import GoodsReceiptNote, GRNLine, PurchaseOrder
from apps.procurement.services.goods_receipt import create_goods_receipt
from apps.procurement.services.purchase_orders import (
    cancel_purchase_order,
    create_purchase_order,
    submit_purchase_order,
)
from apps.procurement.services.vendor_bills import (
    create_vendor_bill,
    record_vendor_payment,
    update_vendor_bill,
    void_vendor_bill,
)

pytestmark = pytest.mark.django_db


def test_create_purchase_order_requires_at_least_one_line():
    supplier = SupplierFactory()

    with pytest.raises(BusinessRuleViolationError):
        create_purchase_order(supplier=supplier, order_date=date.today(), lines=[])


def test_goods_receipt_posts_stock_in_and_advances_po_status():
    variant = ProductVariantFactory()
    supplier = SupplierFactory()

    po = create_purchase_order(
        supplier=supplier,
        order_date=date.today(),
        lines=[{"variant": variant, "quantity_ordered": 20, "unit_cost": Decimal("4.00")}],
    )
    po = submit_purchase_order(purchase_order=po)
    po_line = po.lines.get()

    grn = create_goods_receipt(
        purchase_order=po,
        received_date=date.today(),
        received_by=None,
        lines=[
            {
                "purchase_order_line": po_line,
                "quantity_received": 20,
                "condition": GRNLine.Condition.ACCEPTED,
            }
        ],
    )

    stock_item = get_stock_item(variant=variant)
    assert stock_item.quantity_on_hand == 20
    assert stock_item.avg_cost == Decimal("4.0000")
    assert grn.status == GoodsReceiptNote.Status.QC_PASS

    po_line.refresh_from_db()
    assert po_line.quantity_received == 20

    po.refresh_from_db()
    assert po.status == PurchaseOrder.Status.RECEIVED


def test_goods_receipt_rejects_over_receipt():
    variant = ProductVariantFactory()
    supplier = SupplierFactory()

    po = create_purchase_order(
        supplier=supplier,
        order_date=date.today(),
        lines=[{"variant": variant, "quantity_ordered": 10, "unit_cost": Decimal("4.00")}],
    )
    po = submit_purchase_order(purchase_order=po)
    po_line = po.lines.get()

    with pytest.raises(BusinessRuleViolationError):
        create_goods_receipt(
            purchase_order=po,
            received_date=date.today(),
            received_by=None,
            lines=[
                {
                    "purchase_order_line": po_line,
                    "quantity_received": 11,
                    "condition": GRNLine.Condition.ACCEPTED,
                }
            ],
        )

    stock_item = get_stock_item(variant=variant)
    assert stock_item is None


def test_goods_receipt_rejects_when_po_not_submitted():
    variant = ProductVariantFactory()
    po = PurchaseOrderFactory(status=PurchaseOrder.Status.DRAFT)

    from apps.procurement.factories import PurchaseOrderLineFactory

    po_line = PurchaseOrderLineFactory(purchase_order=po, variant=variant, quantity_ordered=5)

    with pytest.raises(BusinessRuleViolationError):
        create_goods_receipt(
            purchase_order=po,
            received_date=date.today(),
            received_by=None,
            lines=[
                {
                    "purchase_order_line": po_line,
                    "quantity_received": 5,
                    "condition": GRNLine.Condition.ACCEPTED,
                }
            ],
        )


def test_cancel_received_purchase_order_is_rejected():
    po = PurchaseOrderFactory(status=PurchaseOrder.Status.RECEIVED)

    with pytest.raises(BusinessRuleViolationError):
        cancel_purchase_order(purchase_order=po)


def test_vendor_bill_rejects_amount_mismatch():
    variant = ProductVariantFactory()
    supplier = SupplierFactory()

    po = create_purchase_order(
        supplier=supplier,
        order_date=date.today(),
        lines=[{"variant": variant, "quantity_ordered": 10, "unit_cost": Decimal("4.00")}],
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
                "quantity_received": 10,
                "condition": GRNLine.Condition.ACCEPTED,
            }
        ],
    )

    with pytest.raises(BusinessRuleViolationError):
        create_vendor_bill(
            purchase_order=po, supplier=supplier, amount=Decimal("999.00"), due_date=date.today()
        )

    bill = create_vendor_bill(
        purchase_order=po, supplier=supplier, amount=Decimal("40.00"), due_date=date.today()
    )
    assert bill.amount == Decimal("40.00")


def _received_po_with_bill(amount=Decimal("40.00")):
    variant = ProductVariantFactory()
    supplier = SupplierFactory()
    po = create_purchase_order(
        supplier=supplier,
        order_date=date.today(),
        lines=[{"variant": variant, "quantity_ordered": 10, "unit_cost": Decimal("4.00")}],
    )
    po = submit_purchase_order(purchase_order=po)
    create_goods_receipt(
        purchase_order=po,
        received_date=date.today(),
        received_by=None,
        lines=[
            {
                "purchase_order_line": po.lines.get(),
                "quantity_received": 10,
                "condition": GRNLine.Condition.ACCEPTED,
            }
        ],
    )
    return create_vendor_bill(
        purchase_order=po, supplier=supplier, amount=amount, due_date=date.today()
    )


def _ledger_balance():
    lines = JournalEntryLine.objects.all()
    return (
        sum(line.debit - line.credit for line in lines),
        sum(line.debit for line in lines),
        sum(line.credit for line in lines),
    )


def test_voiding_a_vendor_bill_reverses_its_journal_entry():
    bill = _received_po_with_bill()
    original = JournalEntry.objects.get(reference_type="vendor_bill", reference_id=bill.id)

    void_vendor_bill(vendor_bill=bill)

    reversal = JournalEntry.objects.get(reverses=original)
    assert reversal.reference_type == "vendor_bill"
    assert reversal.reference_id == bill.id
    assert bill.bill_number in reversal.description

    original_pairs = {line.account_id: (line.debit, line.credit) for line in original.lines.all()}
    for line in reversal.lines.all():
        debit, credit = original_pairs[line.account_id]
        assert (line.debit, line.credit) == (credit, debit)


def test_voiding_a_vendor_bill_leaves_the_books_balanced_and_the_original_posted():
    bill = _received_po_with_bill()
    original = JournalEntry.objects.get(reference_type="vendor_bill", reference_id=bill.id)

    void_vendor_bill(vendor_bill=bill)

    original.refresh_from_db()
    assert original.status == JournalEntry.Status.POSTED
    assert original.deleted_at is None
    net, total_debit, total_credit = _ledger_balance()
    assert net == Decimal("0")
    assert total_debit == total_credit

    ap_net = sum(
        line.credit - line.debit
        for line in JournalEntryLine.objects.filter(account__code=ACCOUNT_CODES["accounts_payable"])
    )
    assert ap_net == Decimal("0")


def test_voiding_a_bill_twice_is_rejected():
    bill = _received_po_with_bill()
    void_vendor_bill(vendor_bill=bill)

    with pytest.raises(BusinessRuleViolationError) as exc:
        void_vendor_bill(vendor_bill=bill)
    assert exc.value.code == "already_void"


def test_voiding_a_bill_with_payments_is_still_refused():
    bill = _received_po_with_bill()
    record_vendor_payment(
        vendor_bill=bill, amount=Decimal("10.00"), paid_at=timezone.now(), method="bank"
    )

    with pytest.raises(BusinessRuleViolationError) as exc:
        void_vendor_bill(vendor_bill=bill)
    assert exc.value.code == "bill_has_payments"


def test_amending_a_bill_amount_reverses_and_reposts_the_ledger():
    bill = _received_po_with_bill()
    bill.purchase_order.lines.update(unit_cost=Decimal("5.00"))

    update_vendor_bill(vendor_bill=bill, data={"amount": Decimal("50.00")})

    entries = JournalEntry.objects.filter(reference_type="vendor_bill", reference_id=bill.id)
    assert entries.count() == 3
    ap_net = sum(
        line.credit - line.debit
        for line in JournalEntryLine.objects.filter(account__code=ACCOUNT_CODES["accounts_payable"])
    )
    assert ap_net == Decimal("50.00")
    net, _, _ = _ledger_balance()
    assert net == Decimal("0")


def test_vendor_payment_cannot_exceed_the_outstanding_balance():
    bill = _received_po_with_bill()

    with pytest.raises(BusinessRuleViolationError) as exc:
        record_vendor_payment(
            vendor_bill=bill,
            amount=bill.amount + Decimal("0.01"),
            paid_at=timezone.now(),
            method="bank",
        )
    assert exc.value.code == "payment_exceeds_bill"
    assert not bill.payments.exists()


def test_vendor_payments_cannot_overpay_across_instalments():
    bill = _received_po_with_bill()
    record_vendor_payment(
        vendor_bill=bill, amount=Decimal("10.00"), paid_at=timezone.now(), method="bank"
    )

    with pytest.raises(BusinessRuleViolationError) as exc:
        record_vendor_payment(
            vendor_bill=bill, amount=bill.amount, paid_at=timezone.now(), method="bank"
        )
    assert exc.value.code == "payment_exceeds_bill"

    ap_net = sum(
        line.credit - line.debit
        for line in JournalEntryLine.objects.filter(account__code=ACCOUNT_CODES["accounts_payable"])
    )
    assert ap_net >= Decimal("0")


def test_vendor_payment_amount_must_be_positive():
    bill = _received_po_with_bill()

    with pytest.raises(BusinessRuleViolationError) as exc:
        record_vendor_payment(
            vendor_bill=bill, amount=Decimal("0"), paid_at=timezone.now(), method="bank"
        )
    assert exc.value.code == "invalid_amount"
