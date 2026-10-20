from __future__ import annotations

from datetime import timedelta
from uuid import UUID

from django.db.models import Prefetch, Q, QuerySet
from django.utils import timezone

from apps.marketing.models import ConversionEvent

# A send that has not finished in this long is taken to have died with its
# process, and may be claimed again.
STALE_SENDING_AFTER = timedelta(minutes=15)


def purchase_order(order_id: UUID):
    """The order and its lines for a Purchase event: two queries however many
    lines it has, and only the fields the event reads. Line names, SKUs and
    prices are the snapshot taken when the item was added, so no product or
    variant row is joined."""
    from apps.orders.models import SalesOrder, SalesOrderLine

    lines = SalesOrderLine.objects.only(
        "order_id", "variant_sku", "product_name", "variant_title", "unit_price", "quantity"
    ).order_by("created_at")
    return (
        SalesOrder.objects.select_related("coupon")
        .only(
            "id",
            "order_number",
            "customer_id",
            "grand_total",
            "tax_total",
            "shipping_total",
            "coupon",
            "coupon__code",
        )
        .prefetch_related(Prefetch("lines", queryset=lines))
        .filter(id=order_id)
        .first()
    )


def deliverable_conversion_events(*, max_attempts: int, now=None) -> QuerySet[ConversionEvent]:
    """Rows a retry run should try: never sent, failed with attempts left, or
    claimed by a sender that never came back."""
    now = now or timezone.now()
    return ConversionEvent.objects.filter(
        Q(status__in=(ConversionEvent.Status.PENDING, ConversionEvent.Status.FAILED))
        | Q(status=ConversionEvent.Status.SENDING, updated_at__lt=now - STALE_SENDING_AFTER),
        attempts__lt=max_attempts,
    ).order_by("created_at")
