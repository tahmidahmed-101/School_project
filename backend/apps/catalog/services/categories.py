from __future__ import annotations

from django.db import transaction

from apps.catalog.models import Category
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.utils.text import unique_slug_for


@transaction.atomic
def create_category(
    *,
    name: str,
    parent: Category | None = None,
    description: str = "",
    is_active: bool = True,
) -> Category:
    category = Category(
        name=name,
        parent=parent,
        description=description,
        is_active=is_active,
        slug=unique_slug_for(model=Category, text=name),
    )
    category.save()
    return category


@transaction.atomic
def update_category(*, category: Category, data: dict) -> Category:
    allowed_fields = {"name", "parent", "description", "is_active", "image"}
    for field, value in data.items():
        if field in allowed_fields:
            setattr(category, field, value)
    update_fields = [field for field in data if field in allowed_fields]
    if "name" in update_fields:
        category.slug = unique_slug_for(model=Category, text=category.name, instance=category)
        update_fields.append("slug")
    if update_fields:
        category.save(update_fields=update_fields)
    return category


def _ensure_no_active_children(category: Category) -> None:
    if category.children.filter(deleted_at__isnull=True).exists():
        raise BusinessRuleViolationError(
            "Cannot delete a category that still has subcategories.",
            code="category_has_children",
        )


def _ensure_no_active_products(category: Category) -> None:
    if category.products.filter(deleted_at__isnull=True).exists():
        raise BusinessRuleViolationError(
            "Cannot delete a category that still has products. Reassign or delete them first.",
            code="category_has_products",
        )


@transaction.atomic
def delete_category(*, category: Category, actor=None) -> Category:
    _ensure_no_active_children(category)
    _ensure_no_active_products(category)
    category.soft_delete(deleted_by=actor)
    return category
