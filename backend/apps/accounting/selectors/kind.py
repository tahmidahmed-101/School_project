from __future__ import annotations

from collections.abc import Iterable
from uuid import UUID

from django.db.models import Model

from apps.common.params import KIND_PREORDER, KIND_STOCK
from apps.inventory.models import StockLedgerEntry
from apps.orders.models import Payment, ReturnRMA, Shipment
from apps.procurement.models import GRNLine, PurchaseOrderLine, VendorBill, VendorPayment

COMPANY = "company"

VARIANT_KIND = "variant__product__category__category_type"

ORDER_SOURCES: dict[str, type[Model]] = {
    "shipment_revenue": Shipment,
    "shipment_cogs": Shipment,
    "rma_revenue_reversal": ReturnRMA,
    "rma_cogs_reversal": ReturnRMA,
    "customer_payment": Payment,
    "customer_refund": Payment,
}
VARIANT_SOURCES: dict[str, tuple[type[Model], str]] = {
    "goods_receipt_line": (GRNLine, f"purchase_order_line__{VARIANT_KIND}"),
    "stock_adjustment": (StockLedgerEntry, VARIANT_KIND),
    "stock_writeoff": (StockLedgerEntry, VARIANT_KIND),
}
PURCHASE_SOURCES: dict[str, tuple[type[Model], str]] = {
    "vendor_bill": (VendorBill, "purchase_order_id"),
    "vendor_payment": (VendorPayment, "vendor_bill__purchase_order_id"),
}
KINDED_REFERENCE_TYPES = (*ORDER_SOURCES, *VARIANT_SOURCES, *PURCHASE_SOURCES)


def order_kind(order) -> str:
    return order.order_type


def variant_kind(variant) -> str:
    return variant.product.category.category_type


def purchase_kind(purchase_order) -> str:
    return _purchase_kinds([purchase_order.id])[purchase_order.id]


def _purchase_kinds(purchase_order_ids: Iterable[UUID]) -> dict[UUID, str]:
    """Same rule as the purchasing lists: any pre-order line makes the purchase pre-order."""
    ids = set(purchase_order_ids)
    preorder_ids = set(
        PurchaseOrderLine.objects.filter(
            purchase_order_id__in=ids, **{VARIANT_KIND: KIND_PREORDER}
        ).values_list("purchase_order_id", flat=True)
    )
    return {po_id: KIND_PREORDER if po_id in preorder_ids else KIND_STOCK for po_id in ids}


def kinds_for_references(reference_type: str, reference_ids: Iterable[UUID]) -> dict[UUID, str]:
    """Kind of each source document; an id whose document is gone is left out."""
    ids = list(reference_ids)
    if reference_type in ORDER_SOURCES:
        model = ORDER_SOURCES[reference_type]
        return dict(
            model._default_manager.filter(id__in=ids).values_list("id", "order__order_type")
        )
    if reference_type in VARIANT_SOURCES:
        model, path = VARIANT_SOURCES[reference_type]
        return dict(model._default_manager.filter(id__in=ids).values_list("id", path))
    if reference_type in PURCHASE_SOURCES:
        model, path = PURCHASE_SOURCES[reference_type]
        purchase_by_source = dict(model._default_manager.filter(id__in=ids).values_list("id", path))
        kinds = _purchase_kinds(purchase_by_source.values())
        return {source_id: kinds[po_id] for source_id, po_id in purchase_by_source.items()}
    return {}
