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
    lines it has, and only the fields the event reads. Names, SKUs and prices
    are the snapshot taken when the item was added; the variant is joined only
    for its product id, the catalogue id the pixels and the product feed use."""
    from apps.orders.models import SalesOrder, SalesOrderLine

    lines = (
        SalesOrderLine.objects.select_related("variant")
        .only(
            "order_id",
            "variant",
            "variant__product_id",
            "variant_sku",
            "product_name",
            "variant_title",
            "unit_price",
            "quantity",
        )
        .order_by("created_at")
    )
    return (
        SalesOrder.objects.select_related("coupon", "tracking_context")
        .only(
            "id",
            "order_number",
            "customer_id",
            "grand_total",
            "tax_total",
            "shipping_total",
            "coupon",
            "coupon__code",
            "tracking_context__fbp",
            "tracking_context__fbc",
            "tracking_context__ga_client_id",
            "tracking_context__ttp",
            "tracking_context__ttclid",
            "tracking_context__source_url",
            "tracking_context__user_agent",
            "tracking_context__ip_address",
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
