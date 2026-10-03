from __future__ import annotations

from typing import Any

from django.db.models import QuerySet

from apps.orders.models import SalesOrder

EXPORT_COLUMNS = [
    "order_number",
    "customer_email",
    "status",
    "subtotal",
    "tax_total",
    "shipping_total",
    "discount_total",
    "grand_total",
    "line_count",
    "created_at",
]


def export_orders(queryset: QuerySet[SalesOrder]) -> tuple[list[str], list[list[Any]]]:
    orders = list(queryset.select_related("customer").prefetch_related("lines"))
    rows = [
        [
            order.order_number,
            (order.customer.email or "") if order.customer_id else "",
            order.status,
            str(order.subtotal),
            str(order.tax_total),
            str(order.shipping_total),
            str(order.discount_total),
            str(order.grand_total),
            len(order.lines.all()),
            order.created_at.isoformat(),
        ]
        for order in orders
    ]
    return EXPORT_COLUMNS, rows
