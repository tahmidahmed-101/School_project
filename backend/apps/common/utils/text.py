from __future__ import annotations

from django.db.models import Model
from django.utils.text import slugify

from apps.common.exceptions import BusinessRuleViolationError


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


def unique_product_code_for(
    *,
    model: type[Model],
    text: str,  # noqa: ARG001
    field: str = "product_code",
    instance: Model | None = None,
) -> str:
    """A unique 4-digit numeric product code, auto-generated on creation.

    Unlike SKUs (which live on variants), this lives on the product itself so
    staff can tell similar-named products apart when searching (e.g. adding
    stock). Checked against the unfiltered manager so soft-deleted rows can't
    be reused.

    Tries 4-digit codes from 0000 to 9999. Raises BusinessRuleViolationError
    when every 4-digit code is already taken.
    """
    queryset = model._default_manager.all()
    if instance is not None and instance.pk:
        queryset = queryset.exclude(pk=instance.pk)

    existing = set(queryset.values_list(field, flat=True))

    for suffix in range(10000):
        code = f"{suffix:04d}"
        if code not in existing:
            return code

    raise BusinessRuleViolationError(
        "No available 4-digit product code.",
        code="product_code_exhausted",
    )
