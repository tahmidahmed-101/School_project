from __future__ import annotations

from django.db import models

from apps.common.models import TimeStampedModel


class OrderTrackingContext(TimeStampedModel):
    """What the shopper's browser knew when the order was placed, kept so the
    server-side Purchase can be matched to the visit and deduplicated against
    the pixel's own event."""

    order = models.OneToOneField(
        "orders.SalesOrder", on_delete=models.CASCADE, related_name="tracking_context"
    )
    fbp = models.CharField(max_length=128, blank=True)
    fbc = models.CharField(max_length=256, blank=True)
    ga_client_id = models.CharField(max_length=64, blank=True)
    ttp = models.CharField(max_length=128, blank=True)
    ttclid = models.CharField(max_length=256, blank=True)
    source_url = models.URLField(max_length=500, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    def __str__(self) -> str:
        return f"tracking context of order {self.order_id}"
