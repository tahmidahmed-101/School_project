from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import TimeStampedModel


class ConversionEvent(TimeStampedModel):
    """One server-side conversion owed to one analytics provider: an outbox row.

    It is written in the transaction that confirms the order, so a rolled-back
    confirmation leaves nothing to send, and it is sent only after the commit.
    The unique (order, provider, event_name) row is what keeps a re-run
    confirmation, a retried request or a second sender from reporting the same
    purchase twice.
    """

    class Provider(models.TextChoices):
        GA4 = "ga4", "Google Analytics 4"
        META = "meta", "Meta Conversions API"

    class EventName(models.TextChoices):
        PURCHASE = "purchase", "Purchase"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        # Claimed by one sender; a row stuck here past the stale window is
        # picked up again by `send_conversion_events`.
        SENDING = "sending", "Sending"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    order = models.ForeignKey(
        "orders.SalesOrder", on_delete=models.CASCADE, related_name="conversion_events"
    )
    provider = models.CharField(max_length=10, choices=Provider.choices)
    event_name = models.CharField(max_length=30, choices=EventName.choices)
    # Stable across retries, so a provider that sees the event twice (a send
    # that succeeded but whose reply was lost) can drop the copy.
    event_id = models.CharField(max_length=64)
    # When the order was confirmed: the event's own time, not the send time.
    occurred_at = models.DateTimeField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    attempts = models.PositiveSmallIntegerField(default=0)
    # Status code and the provider's reply, trimmed. Never a credential.
    last_error = models.CharField(max_length=500, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering: ClassVar[list] = ["-created_at"]
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["order", "provider", "event_name"], name="uniq_conversion_per_order"
            ),
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["status", "updated_at"], name="conversion_status_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.provider} {self.event_name} {self.order_id} ({self.status})"
