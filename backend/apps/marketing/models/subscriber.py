from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import TimeStampedModel


class NewsletterSubscriber(TimeStampedModel):
    email = models.EmailField(unique=True)
    is_active = models.BooleanField(default=True)
    unsubscribed_at = models.DateTimeField(null=True, blank=True)
    # When this address last agreed to receive the newsletter: its storefront
    # sign-up, a re-subscribe, or staff adding it. Campaigns go only to
    # addresses that have one.
    consented_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering: ClassVar[list] = ["-created_at"]
        indexes: ClassVar[list] = [
            models.Index(fields=["is_active"]),
        ]

    def __str__(self) -> str:
        return self.email


class SmsSubscriber(TimeStampedModel):
    """A phone that agreed to marketing SMS. Keyed by the +8801... form, so
    every spelling of one number is one row. SMS campaigns go only to rows
    that are active and have a consent time."""

    phone = models.CharField(max_length=20, unique=True)
    is_active = models.BooleanField(default=True)
    unsubscribed_at = models.DateTimeField(null=True, blank=True)
    consented_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering: ClassVar[list] = ["-created_at"]
        indexes: ClassVar[list] = [
            models.Index(fields=["is_active"], name="smssub_active_idx"),
        ]

    def __str__(self) -> str:
        return self.phone
