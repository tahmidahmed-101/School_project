from __future__ import annotations

from typing import Any

from django.db.models import Count, QuerySet

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
    orders = (
        queryset.select_related("customer")
        .annotate(line_count=Count("lines"))
        .iterator(chunk_size=500)
    )
    rows = [
        [
            order.order_number,
            (order.customer.email or "") if order.customer else "",
            order.status,
            str(order.subtotal),
            str(order.tax_total),
            str(order.shipping_total),
            str(order.discount_total),
            str(order.grand_total),
            order.line_count,
            order.created_at.isoformat(),
        ]
        for order in orders
    ]
    return EXPORT_COLUMNS, rows
