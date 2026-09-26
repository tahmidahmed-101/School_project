from __future__ import annotations

from decimal import Decimal
from typing import Any

from apps.business.selectors import get_business_profile
from apps.procurement.models import PurchaseOrder

PURCHASE_ORDER_TEMPLATE = "pdf/purchase_order.html"

ZERO = Decimal("0.00")

STATUS_CLASSES = {
    PurchaseOrder.Status.RECEIVED: "pill--settled",
    PurchaseOrder.Status.CANCELLED: "pill--void",
}


def _supplier_lines(supplier: Any) -> list[str]:
    fields = (supplier.contact_email, supplier.phone)
    lines = [value for value in fields if value]
    if supplier.payment_terms:
        lines.append(f"Terms · {supplier.payment_terms}")
    return lines


def purchase_order_filename(purchase_order: PurchaseOrder) -> str:
    return f"purchase-order-{purchase_order.po_number}.pdf"


def build_purchase_order_context(purchase_order: PurchaseOrder) -> dict[str, Any]:
    lines = []
    total = ZERO
    total_units = 0
    for line in purchase_order.lines.all():
        line_total = line.unit_cost * line.quantity_ordered
        total += line_total
        total_units += line.quantity_ordered
        lines.append(
            {
                "name": line.variant.product.name,
                "sku": line.variant.sku,
                "ordered": line.quantity_ordered,
                "received": line.quantity_received,
                "unit_cost": line.unit_cost,
                "total": line_total,
            }
        )

    profile = get_business_profile()
    deliver_lines = [line for line in (profile.formatted_address, profile.phone) if line]

    return {
        "doc_title": "Purchase Order",
        "doc_number": purchase_order.po_number,
        "doc_meta": [
            {"label": "Ordered", "value": purchase_order.order_date.strftime("%d %b %Y")},
        ],
        "doc_status": purchase_order.get_status_display(),
        "doc_status_class": STATUS_CLASSES.get(purchase_order.status, ""),
        "supplier_name": purchase_order.supplier.name,
        "supplier_lines": _supplier_lines(purchase_order.supplier),
        "deliver_name": profile.name,
        "deliver_lines": deliver_lines,
        "lines": lines,
        "total": total,
        "total_units": total_units,
        "line_count": len(lines),
        "notes": purchase_order.notes,
    }
