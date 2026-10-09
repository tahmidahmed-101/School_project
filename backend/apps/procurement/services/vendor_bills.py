from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Sum

from apps.accounting.selectors.journal_entries import unreversed_entries_for_reference
from apps.accounting.services.journal import reverse_journal_entry
from apps.accounting.services.money import quantize_money
from apps.accounting.services.postings import post_vendor_bill, post_vendor_payment
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.utils.codes import generate_document_number
from apps.procurement.models import PurchaseOrder, VendorBill, VendorPayment
from apps.procurement.selectors.kind import purchase_order_kind

BILL_MATCH_TOLERANCE = Decimal("0.01")


def _ensure_three_way_match(purchase_order: PurchaseOrder, amount: Decimal) -> None:
    expected = sum(
        (line.unit_cost * line.quantity_received for line in purchase_order.lines.all()),
        Decimal("0"),
    )
    if abs(amount - expected) > BILL_MATCH_TOLERANCE:
        raise BusinessRuleViolationError(
            "Bill amount does not match received quantities (3-way match failed).",
            code="bill_mismatch",
        )


def _ensure_bill_open(vendor_bill: VendorBill) -> None:
    if vendor_bill.status == VendorBill.Status.VOID:
        raise BusinessRuleViolationError("This bill has been voided.", code="already_void")
    if vendor_bill.status == VendorBill.Status.PAID:
        raise BusinessRuleViolationError("This bill has already been paid.", code="already_paid")
    # A vendor payment means cash actually left the bank. Voiding the bill would
    # reverse only the AP side, leaving the ledger claiming money that is gone.
    if vendor_bill.payments.exists():
        raise BusinessRuleViolationError(
            "This bill already has payments recorded against it.", code="bill_has_payments"
        )


def _reverse_bill_postings(vendor_bill: VendorBill, *, reason: str) -> None:
    for entry in unreversed_entries_for_reference(
        reference_type="vendor_bill", reference_id=vendor_bill.id
    ):
        reverse_journal_entry(entry, reason=reason)


@transaction.atomic
def create_vendor_bill(
    *, purchase_order: PurchaseOrder, supplier, amount: Decimal, due_date
) -> VendorBill:
    if supplier.kind != purchase_order_kind(purchase_order):
        raise BusinessRuleViolationError(
            "Pick a supplier from the same side as the purchase order: stock or pre-order.",
            code="supplier_kind_mismatch",
        )
    _ensure_three_way_match(purchase_order, amount)

    bill_number = generate_document_number("BILL")
    while VendorBill.objects.filter(bill_number=bill_number).exists():
        bill_number = generate_document_number("BILL")

    bill = VendorBill.objects.create(
        bill_number=bill_number,
        purchase_order=purchase_order,
        supplier=supplier,
        amount=amount,
        due_date=due_date,
    )
    post_vendor_bill(bill)
    return bill


@transaction.atomic
def update_vendor_bill(*, vendor_bill: VendorBill, data: dict) -> VendorBill:
    vendor_bill = VendorBill.objects.select_for_update().get(pk=vendor_bill.pk)
    _ensure_bill_open(vendor_bill)

    allowed_fields = {"amount", "due_date"}
    update_fields = [field for field in data if field in allowed_fields]
    if "amount" in update_fields:
        _ensure_three_way_match(vendor_bill.purchase_order, data["amount"])
    reposts = any(
        field in update_fields and data[field] != getattr(vendor_bill, field)
        for field in ("amount", "due_date")
    )
    for field in update_fields:
        setattr(vendor_bill, field, data[field])
    if update_fields:
        vendor_bill.save(update_fields=update_fields)
    if reposts:
        _reverse_bill_postings(vendor_bill, reason=f"Bill {vendor_bill.bill_number} amended")
        post_vendor_bill(vendor_bill)
    return vendor_bill


@transaction.atomic
def void_vendor_bill(*, vendor_bill: VendorBill) -> VendorBill:
    vendor_bill = VendorBill.objects.select_for_update().get(pk=vendor_bill.pk)
    _ensure_bill_open(vendor_bill)
    _reverse_bill_postings(vendor_bill, reason=f"Bill {vendor_bill.bill_number} voided")
    vendor_bill.status = VendorBill.Status.VOID
    vendor_bill.save(update_fields=["status"])
    return vendor_bill


@transaction.atomic
def record_vendor_payment(
    *, vendor_bill: VendorBill, amount: Decimal, paid_at, method: str = "", reference: str = ""
) -> VendorPayment:
    # Lock the bill row so two concurrent payment postings can't both read
    # "not yet paid" and both go through, overpaying or double-marking PAID.
    vendor_bill = VendorBill.objects.select_for_update().get(pk=vendor_bill.pk)
    if vendor_bill.status == VendorBill.Status.VOID:
        raise BusinessRuleViolationError("This bill has been voided.", code="already_void")
    if vendor_bill.status == VendorBill.Status.PAID:
        raise BusinessRuleViolationError("This bill has already been paid.", code="already_paid")

    already_paid = vendor_bill.payments.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    outstanding = vendor_bill.amount - already_paid
    amount = quantize_money(Decimal(amount))
    if amount <= 0:
        raise BusinessRuleViolationError("Payment amount must be positive.", code="invalid_amount")
    if amount > outstanding:
        raise BusinessRuleViolationError(
            f"Payment of {amount} exceeds the {outstanding} still outstanding on this bill.",
            code="payment_exceeds_bill",
        )

    payment = VendorPayment.objects.create(
        vendor_bill=vendor_bill, amount=amount, paid_at=paid_at, method=method, reference=reference
    )
    post_vendor_payment(payment)

    total_paid = already_paid + amount
    if total_paid >= vendor_bill.amount:
        vendor_bill.status = VendorBill.Status.PAID
        vendor_bill.save(update_fields=["status"])

    return payment
