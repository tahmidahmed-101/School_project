from __future__ import annotations

from django.db.models import Count, F, Sum

from apps.common.utils.money import ZERO, quantize
from apps.inventory.models import StockItem
from apps.orders.models import Payment, SalesOrder, SalesOrderLine

OPEN_STATUSES = (SalesOrder.Status.AWAITING_PAYMENT, SalesOrder.Status.CONFIRMED)
BOOK_STATUSES = (*OPEN_STATUSES, SalesOrder.Status.SHIPPED)


def preorder_book_summary() -> dict:
    """The open pre-order book: orders placed and not yet delivered, the money
    received on them and what customers still owe."""
    orders = SalesOrder.objects.filter(
        order_type=SalesOrder.OrderType.PREORDER,
        status__in=BOOK_STATUSES,
        deleted_at__isnull=True,
    )
    book = orders.aggregate(count=Count("id"), value=Sum("grand_total"))
    received = Payment.objects.filter(
        order__in=orders, status__in=(Payment.Status.CAPTURED, Payment.Status.REFUNDED)
    ).aggregate(total=Sum(F("amount") - F("refunded_amount")))["total"]
    value = book["value"] or ZERO
    held = received or ZERO
    return {
        "open_orders": book["count"],
        "order_value": str(quantize(value)),
        "deposits_held": str(quantize(held)),
        "balances_outstanding": str(quantize(max(value - held, ZERO))),
    }


def preorder_demand() -> list[dict]:
    """Units still owed to open pre-orders, per variant, against what is on
    the shelf. `to_buy` is what a purchase has to cover."""
    rows = (
        SalesOrderLine.objects.filter(
            is_preorder=True,
            order__order_type=SalesOrder.OrderType.PREORDER,
            order__status__in=OPEN_STATUSES,
            order__deleted_at__isnull=True,
            allocated_quantity__lt=F("quantity"),
        )
        .values("variant_id", "variant__sku", "variant__product__name")
        .annotate(ordered=Sum("quantity"), allocated=Sum("allocated_quantity"))
        .order_by("variant__product__name", "variant__sku")
    )
    rows = list(rows)
    available = {
        row["variant_id"]: row["total"]
        for row in StockItem.objects.filter(variant_id__in=[r["variant_id"] for r in rows])
        .values("variant_id")
        .annotate(total=Sum(F("quantity_on_hand") - F("quantity_reserved")))
    }
    result = []
    for row in rows:
        waiting = row["ordered"] - row["allocated"]
        on_hand = available.get(row["variant_id"], 0)
        result.append(
            {
                "variant_id": row["variant_id"],
                "variant_sku": row["variant__sku"],
                "product_name": row["variant__product__name"],
                "waiting": waiting,
                "available": on_hand,
                "to_buy": max(waiting - on_hand, 0),
            }
        )
    return result
