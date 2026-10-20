from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel

from .subscriber import NewsletterSubscriber


class EmailCampaign(TimeStampedModel):
    """A newsletter sent to every active, unsuppressed subscriber.

    Marketing mail only: it never reaches someone who has not subscribed, and
    nothing here affects account email (password resets, verification)."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SCHEDULED = "scheduled", "Scheduled"
        SENDING = "sending", "Sending"
        SENT = "sent", "Sent"
        CANCELLED = "cancelled", "Cancelled"

    name = models.CharField(max_length=120, help_text="Internal; subscribers never see it.")
    subject = models.CharField(max_length=200)
    # Plain text. The unsubscribe footer is added when each copy is sent.
    body = models.TextField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    # Set once, when the recipients are fixed at the start of sending.
    recipient_count = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        ordering: ClassVar[list] = ["-created_at"]
        indexes: ClassVar[list] = [
            models.Index(fields=["status", "scheduled_at"], name="campaign_status_sched_idx"),
        ]

    def __str__(self) -> str:
        return self.name


class CampaignDelivery(TimeStampedModel):
    """One campaign's copy for one subscriber: the outbox row the sender works
    through. Unique per campaign and address, so a recipient gets one copy
    however often the sender runs or retries."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SENDING = "sending", "Sending"
        # Accepted by the SMTP server. Not proof it reached the inbox.
        SENT = "sent", "Accepted by the mail server"
        FAILED = "failed", "Failed"
        # Not sent on purpose: unsubscribed or suppressed after the campaign
        # started, or the campaign was cancelled.
        SKIPPED = "skipped", "Skipped"

    campaign = models.ForeignKey(EmailCampaign, on_delete=models.CASCADE, related_name="deliveries")
    # Kept when the subscriber row is deleted, so the campaign's history stays.
    subscriber = models.ForeignKey(
        NewsletterSubscriber, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    email = models.EmailField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    attempts = models.PositiveSmallIntegerField(default=0)
    # A fixed code (apps.business.services.email.failure_reason), never the
    # server's own reply.
    failure_reason = models.CharField(max_length=40, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering: ClassVar[list] = ["created_at"]
        constraints: ClassVar[list] = [
            models.UniqueConstraint(fields=["campaign", "email"], name="uniq_delivery_per_address"),
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["campaign", "status"], name="delivery_campaign_status_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.campaign_id} -> {self.email} ({self.status})"


class EmailSuppression(TimeStampedModel):
    """An address no campaign may be sent to, whatever its subscription says.
    Stored lower-cased. Account email ignores this list entirely."""

    class Reason(models.TextChoices):
        UNSUBSCRIBED = "unsubscribed", "Unsubscribed"
        # The server refused the address outright.
        BOUNCED = "bounced", "Refused by the mail server"
        MANUAL = "manual", "Added by staff"

    email = models.EmailField(unique=True)
    reason = models.CharField(max_length=20, choices=Reason.choices)
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        ordering: ClassVar[list] = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.email} ({self.reason})"
