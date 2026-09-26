from __future__ import annotations

from decimal import Decimal
from typing import Any

from apps.procurement.models import VendorBill

VENDOR_BILL_TEMPLATE = "pdf/vendor_bill.html"

ZERO = Decimal("0.00")

STATUS_CLASSES = {
    VendorBill.Status.PAID: "pill--settled",
    VendorBill.Status.VOID: "pill--void",
}


def _supplier_lines(supplier: Any) -> list[str]:
    fields = (supplier.contact_email, supplier.phone)
    lines = [value for value in fields if value]
    if supplier.payment_terms:
        lines.append(f"Terms · {supplier.payment_terms}")
    return lines


def vendor_bill_filename(bill: VendorBill) -> str:
    return f"vendor-bill-{bill.bill_number}.pdf"


def build_vendor_bill_context(bill: VendorBill) -> dict[str, Any]:
    payments = list(bill.payments.all())
    paid = sum((payment.amount for payment in payments), ZERO)
    balance = bill.amount - paid

    purchase_order = bill.purchase_order
    lines = []
    for line in purchase_order.lines.all():
        received = line.quantity_received
        lines.append(
            {
                "name": line.variant.product.name,
                "sku": line.variant.sku,
                "received": received,
                "unit_cost": line.unit_cost,
                "total": line.unit_cost * received,
            }
        )

    return {
        "doc_title": "Bill",
        "doc_number": bill.bill_number,
        "doc_meta": [
            {"label": "Due", "value": bill.due_date.strftime("%d %b %Y")},
            {"label": "Order", "value": purchase_order.po_number},
        ],
        "doc_status": bill.get_status_display(),
        "doc_status_class": STATUS_CLASSES.get(bill.status, ""),
        "supplier_name": bill.supplier.name,
        "supplier_lines": _supplier_lines(bill.supplier),
        "po_number": purchase_order.po_number,
        "order_date": purchase_order.order_date,
        "lines": lines,
        "payments": [
            {
                "paid_at": payment.paid_at,
                "method": payment.method,
                "reference": payment.reference,
                "amount": payment.amount,
            }
            for payment in payments
        ],
        "amount": bill.amount,
        "paid": paid,
        "balance": balance,
        "due_date": bill.due_date,
        "is_settled": balance <= ZERO,
        "is_void": bill.status == VendorBill.Status.VOID,
    }
