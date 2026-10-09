from __future__ import annotations

from decimal import Decimal
from typing import Any

from apps.catalog.selectors.options import line_variant_title
from apps.orders.models import Payment, SalesOrder
from apps.orders.selectors.payments import order_deposit_due
from apps.orders.services.address_snapshot import snapshot_or_live

INVOICE_TEMPLATE = "pdf/invoice.html"

ZERO = Decimal("0.00")

STATUS_CLASSES = {
    "paid": "pill--settled",
    "refunded": "pill--void",
}


def _person_name(user: Any) -> str:
    return (user.get_full_name() or "").strip() or user.email or ""


def _address_lines(address: dict[str, str]) -> list[str]:
    if not address:
        return []
    get = address.get
    street = ", ".join(part for part in (get("line1"), get("line2")) if part)
    locality = " ".join(part for part in (get("city"), get("postal_code")) if part)
    region = ", ".join(part for part in (locality, get("state"), get("country")) if part)
    return [line for line in (street, region, get("phone")) if line]


def _settlement(order: SalesOrder) -> tuple[Decimal, Decimal, str]:
    received = ZERO
    refunded = ZERO
    for payment in order.payments.all():
        # A fully refunded payment was still received first.
        if payment.status in (Payment.Status.CAPTURED, Payment.Status.REFUNDED):
            received += payment.amount
        refunded += payment.refunded_amount

    net = received - refunded
    if refunded and net <= ZERO:
        label = "refunded"
    elif net >= order.grand_total and order.grand_total > ZERO:
        label = "paid"
    elif net > ZERO:
        label = "part paid"
    else:
        label = "unpaid"
    return net, refunded, label


def invoice_filename(order: SalesOrder) -> str:
    return f"invoice-{order.order_number}.pdf"


def build_invoice_context(order: SalesOrder) -> dict[str, Any]:
    lines = []
    for line in order.lines.all():
        variant = line.variant
        lines.append(
            {
                "name": line.product_name or variant.product.name,
                "variant_title": line_variant_title(line),
                "sku": line.variant_sku or variant.sku,
                "quantity": line.quantity,
                "unit_price": line.unit_price,
                "discount": line.discount_amount,
                "tax": line.tax_amount,
                "total": line.unit_price * line.quantity,
            }
        )

    paid, refunded, payment_label = _settlement(order)
    balance = order.grand_total - paid

    address = snapshot_or_live(order)
    is_preorder = order.order_type == SalesOrder.OrderType.PREORDER
    doc_meta = [{"label": "Issued", "value": order.created_at.strftime("%d %b %Y")}]
    if not is_preorder:
        doc_meta.append({"label": "Status", "value": order.get_status_display()})
    elif order.preorder_stage:
        doc_meta.append({"label": "Stage", "value": order.get_preorder_stage_display()})

    return {
        "doc_title": "Pre-order invoice" if is_preorder else "Invoice",
        "is_preorder": is_preorder,
        "paid_label": "Deposit paid" if is_preorder and balance > ZERO else "Paid",
        "deposit_due": order_deposit_due(order) if is_preorder else None,
        "doc_number": order.order_number,
        "doc_meta": doc_meta,
        "doc_status": payment_label,
        "doc_status_class": STATUS_CLASSES.get(payment_label, ""),
        # An anonymous guest cart has no customer until checkout.
        "customer_name": _person_name(order.customer) if order.customer else "",
        "customer_email": (order.customer.email or "") if order.customer else "",
        "customer_phone": order.customer.phone if order.customer else "",
        "ship_name": address.get("full_name", ""),
        "ship_lines": _address_lines(address),
        "lines": lines,
        "subtotal": order.subtotal,
        "discount_total": order.discount_total,
        "shipping_total": order.shipping_total,
        "tax_total": order.tax_total,
        "grand_total": order.grand_total,
        "paid": paid,
        "refunded": refunded,
        "balance": balance,
        "is_settled": balance <= ZERO,
        "notes": order.notes,
    }
