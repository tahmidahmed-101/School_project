from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from django.core.cache import cache
from django.db.models import Count, F, QuerySet, Sum
from django.db.models.functions import TruncDate

from apps.accounting.constants import ACCOUNT_CODES
from apps.accounting.models import JournalEntry, JournalEntryLine
from apps.accounting.selectors.reports import inventory_valuation
from apps.accounts.constants import UserRole
from apps.accounts.models import User
from apps.catalog.models import ProductVariant
from apps.common.utils.dates import day_after, day_start
from apps.inventory.models import StockItem
from apps.inventory.selectors.stock import stock_items_list
from apps.orders.models import Payment, SalesOrder, SalesOrderLine

# Pure read layer — every function here reuses selectors/models from the
# phases already built rather than introducing new tables.

# A "real order" is one that cleared checkout and was not cancelled. PENDING is
# still an open cart, so counting it would divide revenue by abandoned carts.
NON_ORDER_STATUSES = [SalesOrder.Status.PENDING, SalesOrder.Status.CANCELLED]


def real_orders(*, start: date | None = None, end: date | None = None) -> QuerySet[SalesOrder]:
    """The single definition of the order population behind revenue, order
    count and average order value — they must never drift apart."""
    orders = SalesOrder.objects.filter(deleted_at__isnull=True).exclude(
        status__in=NON_ORDER_STATUSES
    )
    if start is not None:
        orders = orders.filter(created_at__gte=day_start(start))
    if end is not None:
        orders = orders.filter(created_at__lt=day_after(end))
    return orders


def sales_trend(*, start: date, end: date) -> list[dict]:
    return [
        {"date": day, "total": total} for day, (total, _count) in _trend_by_day(start, end).items()
    ]


def stock_turnover(*, start: date, end: date, _memo: dict | None = None) -> Decimal:
    """COGS posted in the period (from Accounting's journal, the single
    source of truth for cost) divided by current inventory valuation, as a
    stand-in for a true daily-averaged inventory figure."""
    memo = {} if _memo is None else _memo

    def _cogs(window_start: date, window_end: date) -> Decimal:
        return JournalEntryLine.objects.filter(
            journal_entry__status=JournalEntry.Status.POSTED,
            journal_entry__entry_date__gte=window_start,
            journal_entry__entry_date__lte=window_end,
            account__code=ACCOUNT_CODES["cogs"],
        ).aggregate(total=Sum("debit"))["total"] or Decimal("0")

    cogs = _memoize(memo, ("cogs", start, end), lambda: _cogs(start, end))
    # Valuation is a point-in-time figure (not per window); the dashboard
    # requests it for several windows at once, so compute it once.
    average_inventory_value = _memoize(memo, "inventory_valuation", lambda: inventory_valuation())
    if average_inventory_value == 0:
        return Decimal("0")
    return cogs / average_inventory_value


def low_stock_summary() -> QuerySet[StockItem]:
    # select_related variant__product too: inventory_alerts()/kpis() read
    # item.variant.product.name for every row, which would otherwise issue
    # one extra query per distinct low-stock variant.
    return stock_items_list(low_stock_only=True).select_related("variant__product")


def _previous_window(start: date, end: date) -> tuple[date, date]:
    span = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    return prev_end - timedelta(days=span - 1), prev_end


def _pct_change(current, previous) -> float | None:
    # None (not 0.0) signals "no baseline" so the client can hide the delta.
    if not previous:
        return None
    return round(float((current - previous) / previous * 100), 2)


def _sign(delta_pct: float | None) -> str:
    if delta_pct is None or delta_pct == 0:
        return "flat"
    return "up" if delta_pct > 0 else "down"


def _memoize(memo: dict, key: Any, factory) -> Any:
    if key not in memo:
        memo[key] = factory()
    return memo[key]


def _trend_by_day(start: date, end: date) -> dict:
    """Revenue total and order count per calendar day for the window, in one
    aggregate — the single source the revenue series, KPI sums and order-count
    sparks are all derived from, so they can never disagree."""
    rows = (
        real_orders(start=start, end=end)
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(total=Sum("grand_total"), order_count=Count("id"))
    )
    by_day = {row["day"]: (row["total"] or Decimal("0"), row["order_count"]) for row in rows}
    span = (end - start).days + 1
    return {
        start
        + timedelta(days=offset): by_day.get(start + timedelta(days=offset), (Decimal("0"), 0))
        for offset in range(span)
    }


def _window_trends(start: date, end: date, memo: dict) -> tuple[dict, dict]:
    # The dashboard's KPIs, revenue chart and ticker all need the same two
    # windows; `memo` lets `dashboard_data` compute each once per request.
    prev_start, prev_end = _previous_window(start, end)
    current = _memoize(memo, ("trend", start, end), lambda: _trend_by_day(start, end))
    previous = _memoize(
        memo, ("trend", prev_start, prev_end), lambda: _trend_by_day(prev_start, prev_end)
    )
    return current, previous


def _sum_totals(trend: dict) -> Decimal:
    return sum((total for total, _count in trend.values()), Decimal("0"))


def _sum_counts(trend: dict) -> int:
    return sum((count for _total, count in trend.values()))


def revenue_series(*, start: date, end: date, _memo: dict | None = None) -> list[dict]:
    """Daily revenue for the current window with the matching day from the
    previous window, aligned per calendar day for the area chart."""
    memo = {} if _memo is None else _memo
    current, previous = _window_trends(start, end, memo)
    span = (end - start).days + 1
    return [
        {
            "label": (start + timedelta(days=offset)).isoformat(),
            "current": float(current[start + timedelta(days=offset)][0]),
            "previous": float(previous.get(start + timedelta(days=offset), (Decimal("0"), 0))[0]),
        }
        for offset in range(span)
    ]


def kpis(*, start: date, end: date, _memo: dict | None = None) -> list[dict]:
    memo = {} if _memo is None else _memo
    prev_start, prev_end = _previous_window(start, end)
    current, previous = _window_trends(start, end, memo)

    current_revenue = _sum_totals(current)
    previous_revenue = _sum_totals(previous)
    current_orders = _sum_counts(current)
    previous_orders = _sum_counts(previous)

    current_turnover = stock_turnover(start=start, end=end, _memo=memo)
    previous_turnover = stock_turnover(start=prev_start, end=prev_end, _memo=memo)
    low_stock_rows = low_stock_rollup(memo)

    revenue_delta = _pct_change(current_revenue, previous_revenue)
    orders_delta = _pct_change(current_orders, previous_orders)
    turnover_delta = _pct_change(current_turnover, previous_turnover)

    return [
        {
            "label": "Revenue",
            "value": float(current_revenue),
            "unit": "currency",
            "delta_pct": revenue_delta,
            "sign": _sign(revenue_delta),
            "good": revenue_delta is None or revenue_delta >= 0,
            "spark": [float(total) for total, _count in current.values()],
        },
        {
            "label": "Orders",
            "value": current_orders,
            "unit": "count",
            "delta_pct": orders_delta,
            "sign": _sign(orders_delta),
            "good": orders_delta is None or orders_delta >= 0,
            "spark": [float(count) for _total, count in current.values()],
        },
        {
            "label": "Stock Turnover",
            "value": round(float(current_turnover), 4),
            "unit": "ratio",
            "delta_pct": turnover_delta,
            "sign": _sign(turnover_delta),
            "good": turnover_delta is None or turnover_delta >= 0,
            "spark": [],
        },
        {
            "label": "Low Stock",
            "value": len(low_stock_rows),
            "unit": "count",
            "delta_pct": None,
            "sign": "flat",
            "good": len(low_stock_rows) == 0,
            "spark": [],
        },
    ]


def category_revenue(*, start: date, end: date) -> list[dict]:
    rows = (
        SalesOrderLine.objects.filter(
            order__created_at__gte=day_start(start),
            order__created_at__lt=day_after(end),
            order__deleted_at__isnull=True,
        )
        .exclude(order__status__in=NON_ORDER_STATUSES)
        .values(name=F("variant__product__category__name"))
        .annotate(total=Sum(F("quantity") * F("unit_price")))
        .order_by("-total")
    )
    total_revenue = sum((row["total"] for row in rows), Decimal("0"))
    if not total_revenue:
        return []
    return [
        {
            "name": row["name"] or "Uncategorized",
            "revenue": row["total"],
            "pct": round(float(row["total"] / total_revenue * 100), 1),
        }
        for row in rows
    ]


_STATUS_BADGE: dict[str, str] = {
    SalesOrder.Status.PENDING: "Pending",
    SalesOrder.Status.CONFIRMED: "Processing",
    SalesOrder.Status.SHIPPED: "Fulfilled",
    SalesOrder.Status.DELIVERED: "Fulfilled",
    SalesOrder.Status.CLOSED: "Fulfilled",
    SalesOrder.Status.CANCELLED: "Refunded",
}


def recent_orders(*, start: date, end: date, limit: int = 8) -> list[dict]:
    orders = list(
        SalesOrder.objects.filter(
            created_at__gte=day_start(start), created_at__lt=day_after(end), deleted_at__isnull=True
        )
        .select_related("customer", "shipping_address")
        .order_by("-created_at")[:limit]
    )
    order_ids = [order.id for order in orders]
    if not order_ids:
        return []

    payments = Payment.objects.filter(order_id__in=order_ids).order_by("-created_at")
    latest_payment: dict[Any, Payment] = {}
    for payment in payments:
        latest_payment.setdefault(payment.order_id, payment)

    lines = SalesOrderLine.objects.filter(order_id__in=order_ids).select_related("variant__product")
    lines_by_order = defaultdict(list)
    for line in lines:
        lines_by_order[line.order_id].append(line)

    rows = []
    for order in orders:
        order_payment = latest_payment.get(order.id)
        address = order.shipping_address
        rows.append(
            {
                "id": order.order_number,
                "order_id": str(order.id),
                "customer": {"name": order.customer.get_full_name() or order.customer.email},
                "items": [
                    {
                        "name": line.variant.product.name,
                        "sku": line.variant.sku,
                        "quantity": line.quantity,
                    }
                    for line in lines_by_order.get(order.id, [])
                ],
                "total_amount": str(order.grand_total),
                "payment_method": (
                    order_payment.method if order_payment and order_payment.method else "card"
                ),
                "status": _STATUS_BADGE.get(order.status, order.status),
                "region": address.city if address else "—",
                "created_at": order.created_at.isoformat(),
            }
        )
    return rows


def _variant_daily_units(variant_ids: list, start: date, end: date) -> dict:
    rows = (
        SalesOrderLine.objects.filter(
            variant_id__in=variant_ids,
            order__created_at__gte=day_start(start),
            order__created_at__lt=day_after(end),
            order__deleted_at__isnull=True,
        )
        .exclude(order__status__in=NON_ORDER_STATUSES)
        .annotate(day=TruncDate("order__created_at"))
        .values("variant_id", "day")
        .annotate(units=Sum("quantity"))
    )
    by_variant: dict = defaultdict(dict)
    for row in rows:
        by_variant[row["variant_id"]][row["day"]] = row["units"]
    span = (end - start).days + 1
    return {
        variant_id: [
            float(by_variant[variant_id].get(start + timedelta(days=i), 0)) for i in range(span)
        ]
        for variant_id in variant_ids
    }


def top_products(*, start: date, end: date, limit: int = 6) -> list[dict]:
    aggregates = (
        SalesOrderLine.objects.filter(
            order__created_at__gte=day_start(start),
            order__created_at__lt=day_after(end),
            order__deleted_at__isnull=True,
        )
        .exclude(order__status__in=NON_ORDER_STATUSES)
        .values("variant_id")
        .annotate(units=Sum("quantity"), revenue=Sum(F("quantity") * F("unit_price")))
        .order_by("-units")[:limit]
    )
    if not aggregates:
        return []

    variant_ids = [row["variant_id"] for row in aggregates]
    variants = {
        variant.id: variant
        for variant in ProductVariant.objects.filter(id__in=variant_ids).select_related("product")
    }
    stock_rows = (
        StockItem.objects.filter(variant_id__in=variant_ids)
        .values("variant_id")
        .annotate(on_hand=Sum("quantity_on_hand"), reserved=Sum("quantity_reserved"))
    )
    stock_by_variant = {
        row["variant_id"]: (row["on_hand"] or 0) - (row["reserved"] or 0) for row in stock_rows
    }
    daily = _variant_daily_units(variant_ids, start, end)

    rows = []
    for rank, aggregate in enumerate(aggregates, start=1):
        variant = variants.get(aggregate["variant_id"])
        if variant is None:
            continue
        rows.append(
            {
                "rank": rank,
                "sku": variant.sku,
                "name": variant.product.name,
                "units": aggregate["units"] or 0,
                "revenue": aggregate["revenue"] or Decimal("0"),
                "stock": stock_by_variant.get(variant.id, 0),
                "spark": daily[variant.id],
            }
        )
    return rows


def low_stock_rollup(_memo: dict | None = None) -> list[dict]:
    """Low-stock rows keyed per variant, the granularity the dashboard's
    inventory table and KPI both use. `_memo` lets a single dashboard request
    resolve the (global, point-in-time) low-stock set once across the KPI,
    inventory list and ticker sections."""
    memo = {} if _memo is None else _memo
    items = _memoize(memo, "low_stock_items", lambda: list(low_stock_summary()))

    aggregated: dict = {}
    for item in items:
        entry = aggregated.setdefault(
            item.variant_id, {"variant": item.variant, "available": 0, "reorder": 0}
        )
        entry["available"] += item.available
        entry["reorder"] = max(entry["reorder"], item.reorder_point)

    rows = []
    for entry in aggregated.values():
        variant = entry["variant"]
        available = entry["available"]
        reorder = entry["reorder"]
        rows.append(
            {
                "sku": variant.sku,
                "name": variant.product.name,
                "stock": available,
                "reorder": reorder,
                "level": "critical" if available <= max(reorder // 2, 0) else "low",
            }
        )
    rows.sort(key=lambda row: row["stock"])
    return rows


def low_stock_counts(_memo: dict | None = None) -> dict:
    rows = low_stock_rollup(_memo)
    return {
        "total": len(rows),
        "critical": sum(1 for row in rows if row["level"] == "critical"),
    }


def inventory_alerts(*, limit: int = 8, _memo: dict | None = None) -> list[dict]:
    return low_stock_rollup(_memo)[:limit]


_SEGMENT_CONFIG = [
    ("New", "#22d3ee"),
    ("Active", "#f59e0b"),
    ("VIP", "#a78bfa"),
]


def customer_segments() -> list[dict]:
    customer_ids = list(
        User.objects.filter(
            role=UserRole.CUSTOMER, is_active=True, deleted_at__isnull=True
        ).values_list("id", flat=True)
    )
    total = len(customer_ids)
    if not total:
        return []

    order_counts = {
        row["customer_id"]: row["order_count"]
        for row in (
            SalesOrder.objects.filter(customer_id__in=customer_ids, deleted_at__isnull=True)
            .exclude(status__in=NON_ORDER_STATUSES)
            .values("customer_id")
            .annotate(order_count=Count("id"))
        )
    }

    buckets = [0, 0, 0]
    for customer_id in customer_ids:
        order_count = order_counts.get(customer_id, 0)
        if order_count == 0:
            buckets[0] += 1
        elif order_count < 3:
            buckets[1] += 1
        else:
            buckets[2] += 1

    return [
        {
            "name": name,
            "count": count,
            "pct": round(count / total * 100, 1),
            "color": color,
        }
        for (name, color), count in zip(_SEGMENT_CONFIG, buckets, strict=True)
    ]


def fulfillment_summary(*, start: date, end: date) -> list[dict]:
    prev_start, prev_end = _previous_window(start, end)

    def status_counts(window_start: date, window_end: date) -> dict:
        rows = (
            SalesOrder.objects.filter(
                created_at__gte=day_start(window_start),
                created_at__lt=day_after(window_end),
                deleted_at__isnull=True,
            )
            .values("status")
            .annotate(count=Count("id"))
        )
        return {row["status"]: row["count"] for row in rows}

    current = status_counts(start, end)
    previous = status_counts(prev_start, prev_end)

    def metric(label: str, value: int, previous_value: int, good_when_up: bool) -> dict:
        delta = _pct_change(value, previous_value)
        good = True if delta is None else delta >= 0 if good_when_up else delta <= 0
        return {"label": label, "value": value, "delta_pct": delta, "good": good}

    return [
        metric(
            "Delivered",
            current.get(SalesOrder.Status.DELIVERED, 0) + current.get(SalesOrder.Status.CLOSED, 0),
            previous.get(SalesOrder.Status.DELIVERED, 0)
            + previous.get(SalesOrder.Status.CLOSED, 0),
            good_when_up=True,
        ),
        metric(
            "Shipped",
            current.get(SalesOrder.Status.SHIPPED, 0),
            previous.get(SalesOrder.Status.SHIPPED, 0),
            good_when_up=True,
        ),
        metric(
            "Pending fulfillment",
            current.get(SalesOrder.Status.CONFIRMED, 0),
            previous.get(SalesOrder.Status.CONFIRMED, 0),
            good_when_up=False,
        ),
        metric(
            "Cancelled",
            current.get(SalesOrder.Status.CANCELLED, 0),
            previous.get(SalesOrder.Status.CANCELLED, 0),
            good_when_up=False,
        ),
    ]


def ticker_items(*, start: date, end: date, _memo: dict | None = None) -> list[dict]:
    memo = {} if _memo is None else _memo
    prev_start, prev_end = _previous_window(start, end)
    current, previous = _window_trends(start, end, memo)
    prev_orders = _sum_counts(previous)

    current_revenue = _sum_totals(current)
    previous_revenue = _sum_totals(previous)
    orders_count = _sum_counts(current)
    turnover = stock_turnover(start=start, end=end, _memo=memo)
    previous_turnover = stock_turnover(start=prev_start, end=prev_end, _memo=memo)
    low_stock_count = low_stock_counts(memo)["total"]
    delivered_count = SalesOrder.objects.filter(
        status__in=[SalesOrder.Status.DELIVERED, SalesOrder.Status.CLOSED],
        deleted_at__isnull=True,
    ).count()

    # Low stock is point-in-time and Delivered is all-time cumulative, so neither
    # has a previous window to compare against — never fabricate a direction.
    return [
        {
            "label": "Revenue",
            "value": float(current_revenue),
            "unit": "currency",
            "dir": _sign(_pct_change(current_revenue, previous_revenue)),
        },
        {
            "label": "Orders",
            "value": orders_count,
            "unit": "count",
            "dir": _sign(_pct_change(orders_count, prev_orders)),
        },
        {"label": "Low stock", "value": low_stock_count, "unit": "count", "dir": "flat"},
        {
            "label": "Turnover",
            "value": round(float(turnover), 4),
            "unit": "ratio",
            "dir": _sign(_pct_change(turnover, previous_turnover)),
        },
        {"label": "Delivered", "value": delivered_count, "unit": "count", "dir": "flat"},
    ]


_DASHBOARD_CACHE_KEY_PREFIX = "reporting:dashboard_data"
_DASHBOARD_CACHE_TTL_SECONDS = 30


def dashboard_data(*, start: date, end: date) -> dict:
    """The full admin dashboard payload for a window.

    Cached briefly per `(start, end)`: the section builders are re-runnable on
    every request otherwise (the previous window is recomputed for KPIs, the
    revenue chart and the ticker separately), and a dashboard tolerates the
    same short staleness the admin-index stats cache already accepts. The
    window is part of the key, so a different date range always re-aggregates.
    """
    key = f"{_DASHBOARD_CACHE_KEY_PREFIX}:{start.isoformat()}:{end.isoformat()}"
    payload = cache.get(key)
    if payload is not None:
        return payload

    # One memo per render: every section shares the trend windows, COGS,
    # inventory valuation and low-stock set instead of each re-querying them.
    memo: dict = {}
    payload = {
        "kpis": kpis(start=start, end=end, _memo=memo),
        "revenue": revenue_series(start=start, end=end, _memo=memo),
        "categories": category_revenue(start=start, end=end),
        "orders": recent_orders(start=start, end=end),
        "top_products": top_products(start=start, end=end),
        "inventory": inventory_alerts(_memo=memo),
        "low_stock": low_stock_counts(memo),
        "segments": customer_segments(),
        "fulfillment": fulfillment_summary(start=start, end=end),
        "ticker": ticker_items(start=start, end=end, _memo=memo),
    }
    cache.set(key, payload, _DASHBOARD_CACHE_TTL_SECONDS)
    return payload
