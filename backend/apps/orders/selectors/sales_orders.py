from __future__ import annotations

from datetime import date
from uuid import UUID

from django.db.models import Count, Exists, OuterRef, Prefetch, Q, QuerySet, Sum

from apps.common.utils.codes import hash_code
from apps.common.utils.dates import day_after, day_start
from apps.common.utils.money import ZERO, quantize
from apps.orders.models import SalesOrder, SalesOrderLine
from apps.orders.selectors.shipments import with_delivered_quantity


def _placed_orders() -> QuerySet[SalesOrder]:
    """Checked-out orders. A pending order is a cart, which has no kind yet."""
    return SalesOrder.objects.filter(deleted_at__isnull=True).exclude(
        status=SalesOrder.Status.PENDING
    )


def customers_of_kind(users: QuerySet, kind: str) -> QuerySet:
    """One half's view of the customer list. A customer is one person, so the
    same account is in both halves once they have ordered from both. Someone
    who has not ordered yet is listed on the stock half only."""
    placed = _placed_orders().filter(customer=OuterRef("pk"))
    has_preorder = Exists(placed.filter(order_type=SalesOrder.OrderType.PREORDER))
    if kind == SalesOrder.OrderType.PREORDER:
        return users.filter(has_preorder)
    return users.filter(
        Exists(placed.filter(order_type=SalesOrder.OrderType.STOCK)) | ~has_preorder
    )


def customer_order_summary(customer, *, kind: str | None = None) -> dict:
    """With `kind`, the figures of that half only; `total_spent` is then the
    customer's lifetime value on that half."""
    orders = (
        _placed_orders().filter(order_type=kind)
        if kind
        else SalesOrder.objects.filter(deleted_at__isnull=True)
    )
    result = orders.filter(customer=customer).aggregate(
        total_orders=Count("id"),
        completed_orders=Count(
            "id",
            filter=Q(status__in=[SalesOrder.Status.DELIVERED, SalesOrder.Status.CLOSED]),
        ),
        cancelled_orders=Count("id", filter=Q(status=SalesOrder.Status.CANCELLED)),
        pending_orders=Count(
            "id",
            filter=Q(
                status__in=[
                    SalesOrder.Status.PENDING,
                    SalesOrder.Status.AWAITING_PAYMENT,
                    SalesOrder.Status.CONFIRMED,
                    SalesOrder.Status.SHIPPED,
                ]
            ),
        ),
        total_spent=Sum(
            "grand_total",
            filter=~Q(status=SalesOrder.Status.CANCELLED),
        ),
    )
    return {
        "total_orders": result["total_orders"] or 0,
        "completed_orders": result["completed_orders"] or 0,
        "cancelled_orders": result["cancelled_orders"] or 0,
        "pending_orders": result["pending_orders"] or 0,
        "total_spent": str(quantize(result["total_spent"] or ZERO)),
    }


def orders_for_customer(customer, *, status: str | None = None) -> QuerySet[SalesOrder]:
    queryset = (
        SalesOrder.objects.select_related("coupon")
        # The line serializer names each line's product, hence variant + product.
        .prefetch_related("lines__variant__product", "shipments__carrier")
        .filter(customer=customer, deleted_at__isnull=True)
    )
    if status:
        queryset = queryset.filter(status=status)
    return queryset.order_by("-created_at")


def _orders_with_related() -> QuerySet[SalesOrder]:
    return SalesOrder.objects.select_related(
        "customer", "shipping_address", "coupon"
    ).prefetch_related(
        # Each line carries `delivered_quantity`, summed in the lines query itself.
        Prefetch("lines", queryset=with_delivered_quantity(SalesOrderLine.objects.all())),
        "lines__variant__product",
        "lines__variant__images",
        "lines__variant__product__images",
        "payments",
        "shipments__carrier",
        "shipments__lines",
        "rmas__lines",
        "preorder_stage_events__changed_by",
    )


def orders_list(
    *,
    customer=None,
    status: str | None = None,
    preorder_stage: str | None = None,
    order_type: str | None = None,
    search: str | None = None,
    start: date | None = None,
    end: date | None = None,
) -> QuerySet[SalesOrder]:
    queryset = _orders_with_related().filter(deleted_at__isnull=True)
    if customer is not None:
        queryset = queryset.filter(customer=customer)
    if status:
        queryset = queryset.filter(status=status)
    if preorder_stage:
        queryset = queryset.filter(preorder_stage=preorder_stage)
    if order_type:
        queryset = queryset.filter(order_type=order_type)
    if search:
        queryset = queryset.filter(order_number__icontains=search)
    if start is not None:
        queryset = queryset.filter(created_at__gte=day_start(start))
    if end is not None:
        queryset = queryset.filter(created_at__lt=day_after(end))
    return queryset.order_by("-created_at")


def get_order_by_id(order_id: str | UUID) -> SalesOrder | None:
    return _orders_with_related().filter(id=order_id, deleted_at__isnull=True).first()


def get_order_line_by_id(line_id: str | UUID):
    return SalesOrderLine.objects.select_related("order", "variant").filter(pk=line_id).first()


def get_cart(customer) -> SalesOrder | None:
    return SalesOrder.objects.filter(
        customer=customer, status=SalesOrder.Status.PENDING, deleted_at__isnull=True
    ).first()


def get_guest_cart(token: str | None) -> SalesOrder | None:
    """The open guest cart a bearer token addresses. None for an unknown
    token, and once the cart is checked out (it is no longer pending, and has
    an owner), so a used token can't reach the order it became."""
    if not token:
        return None
    return SalesOrder.objects.filter(
        guest_token_hash=hash_code(token),
        customer__isnull=True,
        status=SalesOrder.Status.PENDING,
        deleted_at__isnull=True,
    ).first()


def customer_carts_list(*, kind: str | None = None) -> QuerySet[SalesOrder]:
    """Every customer's open cart that has something in it — the same
    `pending` order `get_cart` returns, so a checked-out order (anything past
    pending) never appears. `updated_at` is the last cart change: every line
    edit recalculates and saves the order."""
    carts = (
        SalesOrder.objects.filter(status=SalesOrder.Status.PENDING, deleted_at__isnull=True)
        .filter(Exists(SalesOrderLine.objects.filter(order=OuterRef("pk"))))
        .select_related("customer")
        # Lines carry product name and SKU snapshots, so no variant join.
        .prefetch_related(Prefetch("lines", queryset=SalesOrderLine.objects.order_by("created_at")))
    )
    if kind:
        # A cart has no order_type until checkout; its lines decide, the same
        # flag the mixed-basket check reads.
        holds_preorder = Exists(
            SalesOrderLine.objects.filter(order=OuterRef("pk"), is_preorder=True)
        )
        carts = carts.filter(
            holds_preorder if kind == SalesOrder.OrderType.PREORDER else ~holds_preorder
        )
    return carts


def get_order_for_document(order_id: str | UUID) -> SalesOrder | None:
    """Detail fetch that also walks lines to product, which the PDF prints."""
    return (
        SalesOrder.objects.select_related("customer")
        .prefetch_related("lines__variant__product", "payments")
        .filter(id=order_id, deleted_at__isnull=True)
        .first()
    )
