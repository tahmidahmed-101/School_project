from __future__ import annotations

from django.db.models import Model
from django.utils.text import slugify


def generate_slug(text: str) -> str:
    return slugify(text)


def unique_slug_for(
    *,
    model: type[Model],
    text: str,
    field: str = "slug",
    instance: Model | None = None,
) -> str:
    """Excludes `instance` itself so updating an existing row keeps its
    current slug instead of colliding with itself."""
    base_slug = generate_slug(text) or "item"
    slug = base_slug
    queryset = model._default_manager.all()
    if instance is not None and instance.pk:
        queryset = queryset.exclude(pk=instance.pk)

    suffix = 2
    while queryset.filter(**{field: slug}).exists():
        slug = f"{base_slug}-{suffix}"
        suffix += 1
    return slug


def unique_sku_for(
    *,
    model: type[Model],
    text: str,
    field: str = "sku",
    instance: Model | None = None,
) -> str:
    """SKUs stay unique against soft-deleted rows too, so this checks the
    unfiltered manager."""
    base_sku = (generate_slug(text) or "item").upper()
    sku = base_sku
    queryset = model._default_manager.all()
    if instance is not None and instance.pk:
        queryset = queryset.exclude(pk=instance.pk)

    suffix = 2
    while queryset.filter(**{field: sku}).exists():
        sku = f"{base_sku}-{suffix}"
        suffix += 1
    return sku
