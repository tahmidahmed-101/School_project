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
