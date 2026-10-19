"""Shared builders for the promotion popup tests."""

from __future__ import annotations

import io
from datetime import timedelta
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image

from apps.business.models import PromotionPopup, PromotionPopupProduct
from apps.catalog.factories import ProductVariantFactory
from apps.catalog.models import Product, Sale
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


def stock_product(price="1000.00", **fields) -> Product:
    if "product__category" not in fields:
        fields["product__category__category_type"] = "stock"
    variant = ProductVariantFactory(price=Decimal(price), product__is_active=True, **fields)
    return variant.product


def preorder_product(price="1000.00", **fields) -> Product:
    return ProductVariantFactory(
        price=Decimal(price),
        product__is_active=True,
        product__category__category_type="preorder",
        **fields,
    ).product


def open_preorder_product(price="1000.00", **fields) -> Product:
    """A pre-order product inside its ordering window."""
    now = timezone.now()
    return preorder_product(
        price,
        is_preorder_enabled=True,
        preorder_start_date=now - timedelta(days=1),
        preorder_end_date=now + timedelta(days=10),
        **fields,
    )


def window(starts_in_days=-1, ends_in_days=5) -> dict:
    now = timezone.now()
    return {
        "starts_at": now + timedelta(days=starts_in_days),
        "ends_at": now + timedelta(days=ends_in_days),
    }


def popup(sale_row: Sale | None, products: list[Product], **fields) -> PromotionPopup:
    """A popup written straight to the table, for read-side tests. Pass no sale
    and `placement="preorder"` for a pre-order popup."""
    row = PromotionPopup.objects.create(
        name=fields.pop("name", "Eid popup"),
        title_en=fields.pop("title_en", "Eid sale"),
        sale=sale_row,
        **{**window(), **fields},
    )
    PromotionPopupProduct.objects.bulk_create(
        PromotionPopupProduct(popup=row, product=product, sort_order=index)
        for index, product in enumerate(products)
    )
    return row
