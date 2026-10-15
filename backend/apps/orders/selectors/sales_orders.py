from __future__ import annotations

from datetime import date, timedelta
from uuid import UUID

from django.db.models import Count, Exists, F, OuterRef, Prefetch, Q, QuerySet, Sum
from django.utils import timezone

from apps.common.utils.codes import hash_code
from apps.common.utils.dates import day_after, day_start
from apps.common.utils.money import ZERO, quantize
from apps.common.utils.phone import local_bd_mobile
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
        .prefetch_related(
            "lines__variant__product", "lines__variant__option_values__option", "shipments__carrier"
        )
        .filter(customer=customer, deleted_at__isnull=True)
    )
    if status:
        queryset = queryset.filter(status=status)
    return queryset.order_by("-created_at")


def _holds_preorder() -> Exists:
    return Exists(
        SalesOrderLine.objects.filter(
            order=OuterRef("pk"),
            variant__product__category__category_type=SalesOrder.OrderType.PREORDER,
        )
    )


def _of_kind(kind: str) -> Q:
    """An open cart has no order_type until checkout, so its lines decide; a
    placed order is what checkout made it."""
    pending = Q(status=SalesOrder.Status.PENDING)
    holds_preorder = _holds_preorder()
    if kind == SalesOrder.OrderType.PREORDER:
        return (pending & Q(holds_preorder)) | (~pending & Q(order_type=kind))
    return (pending & ~Q(holds_preorder)) | (~pending & Q(order_type=kind))


def order_kind(order: SalesOrder) -> str:
    """Python twin of `_of_kind`, for one loaded order."""
    if order.status != SalesOrder.Status.PENDING:
        return order.order_type
    if any(line.variant.is_preorder_kind for line in order.lines.all()):
        return SalesOrder.OrderType.PREORDER
    return SalesOrder.OrderType.STOCK


def _orders_with_related() -> QuerySet[SalesOrder]:
    return SalesOrder.objects.select_related(
        "customer", "shipping_address", "coupon"
    ).prefetch_related(
        # Each line carries `delivered_quantity`, summed in the lines query itself.
        Prefetch("lines", queryset=with_delivered_quantity(SalesOrderLine.objects.all())),
        "lines__variant__product__category",
        "lines__variant__images",
        "lines__variant__product__images",
        "lines__variant__option_values",
        "payments",
        "risk_assessments",
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
        queryset = queryset.filter(_of_kind(order_type))
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
        .prefetch_related(
            Prefetch(
                "lines",
                queryset=SalesOrderLine.objects.select_related(
                    "variant__product__category"
                ).order_by("created_at"),
            )
        )
    )
    if kind:
        holds_preorder = _holds_preorder()
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


def get_order_by_number(order_number: str) -> SalesOrder | None:
    """A placed order by its number, with its lines and payments loaded."""
    return (
        _placed_orders()
        .prefetch_related("lines", "payments")
        .filter(order_number=order_number)
        .first()
    )


def orders_today_summary() -> dict:
    """Counts for the staff daily summary, in one query. "New today" counts
    placed orders by the day their cart was opened: an order has no separate
    placed-at time."""
    return _placed_orders().aggregate(
        new_today=Count("id", filter=Q(created_at__gte=day_start(timezone.localdate()))),
        awaiting_payment=Count("id", filter=Q(status=SalesOrder.Status.AWAITING_PAYMENT)),
        awaiting_shipment=Count("id", filter=Q(status=SalesOrder.Status.CONFIRMED)),
    )


def orders_awaiting_payment() -> QuerySet[SalesOrder]:
    """Placed orders still waiting for their payment, oldest first, with the
    payments loaded so a list reads the method without a query per order."""
    return (
        _placed_orders()
        .filter(status=SalesOrder.Status.AWAITING_PAYMENT)
        .prefetch_related("payments")
        .order_by("created_at")
    )


# Two open orders to the same phone with the same items inside this window are
# flagged as a possible double submission. A warning only: nothing is blocked.
DUPLICATE_ORDER_WINDOW = timedelta(hours=24)
DUPLICATE_ORDER_STATUSES = (SalesOrder.Status.AWAITING_PAYMENT, SalesOrder.Status.CONFIRMED)


def _order_phone(order: SalesOrder) -> str:
    if order.contact_phone:
        return order.contact_phone
    return order.shipping_address.phone if order.shipping_address_id else ""


def _line_quantities(order: SalesOrder) -> dict:
    quantities: dict = {}
    for line in order.lines.all():
        quantities[line.variant_id] = quantities.get(line.variant_id, 0) + line.quantity
    return quantities


def possible_duplicate_orders(order: SalesOrder) -> list[SalesOrder]:
    """Other open orders that look like the same purchase submitted twice:
    same recipient phone, identical variants and quantities, placed within
    `DUPLICATE_ORDER_WINDOW` of this one. Two queries however many match."""
    phone = local_bd_mobile(_order_phone(order))
    if not phone:
        return []
    # The same number is stored as typed: 01XXXXXXXXX, 8801XXXXXXXXX or +8801XXXXXXXXX.
    spellings = {phone, f"88{phone}", f"+88{phone}"}
    candidates = (
        _placed_orders()
        .filter(
            Q(contact_phone__in=spellings)
            | Q(contact_phone="", shipping_address__phone__in=spellings),
            status__in=DUPLICATE_ORDER_STATUSES,
            created_at__gte=order.created_at - DUPLICATE_ORDER_WINDOW,
            created_at__lte=order.created_at + DUPLICATE_ORDER_WINDOW,
        )
        .exclude(pk=order.pk)
        .prefetch_related("lines")
    )
    wanted = _line_quantities(order)
    return [other for other in candidates if _line_quantities(other) == wanted]


def units_sold_by_product(product_ids: list) -> dict:
    """Units ordered of each product, less returns. Carts and cancelled orders do not count."""
    rows = (
        SalesOrderLine.objects.filter(variant__product_id__in=product_ids)
        .exclude(order__status__in=[SalesOrder.Status.PENDING, SalesOrder.Status.CANCELLED])
        .values("variant__product_id")
        .annotate(sold=Sum(F("quantity") - F("returned_quantity")))
    )
    return {row["variant__product_id"]: row["sold"] or 0 for row in rows}
