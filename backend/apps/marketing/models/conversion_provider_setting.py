from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel

from .conversion_event import ConversionEvent


class ConversionProviderSetting(TimeStampedModel):
    """The shop's own GA4 or Meta credentials, saved from the dashboard.

    One row per provider (the project runs one business). A row, once it
    exists, decides that provider on its own — including `is_enabled=False`,
    which switches the provider off even where environment variables would
    turn it on. With no row, the environment variables apply as they always
    have. Deleting the row hands the provider back to them.
    """

    provider = models.CharField(
        max_length=10, choices=ConversionEvent.Provider.choices, unique=True
    )
    is_enabled = models.BooleanField(default=False)
    # GA4 Measurement ID or Meta Pixel ID. Public by nature: the storefront
    # loads the same value in the browser.
    tracking_id = models.CharField(max_length=64, blank=True)
    # GA4 Measurement Protocol API secret or Meta Conversions API access token,
    # Fernet-encrypted (apps.common.utils.secrets). Never serialized.
    secret_ciphertext = models.TextField(blank=True)
    secret_updated_at = models.DateTimeField(null=True, blank=True)
    # Meta only: routes events to Events Manager's test view.
    test_event_code = models.CharField(max_length=64, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        ordering: ClassVar[list] = ["provider"]

    def __str__(self) -> str:
        return f"{self.provider}: {'on' if self.is_enabled else 'off'}"
