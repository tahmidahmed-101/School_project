from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import TimeStampedModel


class CourierWebhookEvent(TimeStampedModel):
    """Inbox row for one inbound courier webhook delivery.

    Couriers do not issue their own event ids, so `event_id` is synthesised
    by the caller from the carrier, consignment, event name and timestamp.
    The unique constraint on it is what makes a redelivered webhook a no-op
    instead of double-applying a status change.
    """

    class Status(models.TextChoices):
        RECEIVED = "received", "Received"
        PROCESSED = "processed", "Processed"
        IGNORED = "ignored", "Ignored"
        FAILED = "failed", "Failed"

    TERMINAL_STATUSES: ClassVar[tuple[str, ...]] = (Status.PROCESSED, Status.IGNORED)

    carrier = models.ForeignKey(
        "logistics.Carrier", on_delete=models.CASCADE, related_name="webhook_events"
    )
    shipment = models.ForeignKey(
        "orders.Shipment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="courier_webhook_events",
    )
    event_id = models.CharField(max_length=255, unique=True)
    event_type = models.CharField(max_length=100, blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.RECEIVED
    )
    payload = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering: ClassVar[list] = ["-created_at"]
        indexes: ClassVar[list] = [models.Index(fields=["carrier", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.carrier_id}:{self.event_type} ({self.status})"
