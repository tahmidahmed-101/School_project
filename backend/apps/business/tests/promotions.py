"""Shared builders for the promotion popup tests."""

from __future__ import annotations

import io
from datetime import timedelta
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image

from apps.business.models import PromotionPopup
from apps.catalog.models import Sale
from apps.catalog.services.sales import create_sale

POPUPS = "/api/v1/admin/settings/promotion-popups/"
CONTENT = "/api/v1/public/storefront-content/"


def png(name: str = "popup.png") -> SimpleUploadedFile:
    """A fresh file per call — an upload consumes the pointer."""
    buffer = io.BytesIO()
    Image.new("RGB", (2, 2), "red").save(buffer, format="PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


def sale(percent="20.00", *, starts_in_days=-1, ends_in_days=7, **fields) -> Sale:
    now = timezone.now()
    return create_sale(
        name=fields.pop("name", "Eid offer"),
        percent_off=Decimal(percent),
        starts_at=now + timedelta(days=starts_in_days),
        ends_at=None if ends_in_days is None else now + timedelta(days=ends_in_days),
        **fields,
    )


def popup(sale_row: Sale | None, **fields) -> PromotionPopup:
    """A popup written straight to the table, for read-side tests. Pass no sale
    and `placement="preorder"` for a pre-order popup."""
    return PromotionPopup.objects.create(image=fields.pop("image", png()), sale=sale_row, **fields)
