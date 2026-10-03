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
    category_type: str | None = None,
) -> Category:
    if parent is not None:
        if category_type is not None and category_type != parent.category_type:
            raise BusinessRuleViolationError(
                "A subcategory's type must match its parent category's type.",
                code="category_type_mismatch",
            )
        category_type = parent.category_type
    elif category_type is None:
        category_type = Category.CategoryType.STOCK
    category = Category(
        name=name,
        parent=parent,
        description=description,
        category_type=category_type,
        slug=unique_slug_for(model=Category, text=name),
    )
    category.save()
    return category


def _cascade_category_type(category: Category, category_type: str) -> None:
    """Push a type change down through the whole subtree so every descendant's
    stored `category_type` stays in lockstep with its ancestor chain. Walks
    level by level with one bulk UPDATE per level, so cost scales with tree
    depth rather than subtree size."""
    level_ids = [category.id]
    while True:
        child_ids = list(
            Category.objects.filter(parent_id__in=level_ids).values_list("id", flat=True)
        )
        if not child_ids:
            return
        Category.objects.filter(id__in=child_ids).update(category_type=category_type)
        level_ids = child_ids


@transaction.atomic
def update_category(*, category: Category, data: dict) -> Category:
    allowed_fields = {"name", "parent", "description", "is_active", "image", "category_type"}
    data = dict(data)

    resolved_type = category.category_type
    type_changed = False

    if "parent" in data:
        new_parent = data["parent"]
        if new_parent is not None:
            if "category_type" in data and data["category_type"] != new_parent.category_type:
                raise BusinessRuleViolationError(
                    "A subcategory's type must match its parent category's type.",
                    code="category_type_mismatch",
                )
            resolved_type = new_parent.category_type
        elif "category_type" in data:
            resolved_type = data["category_type"]
        data["category_type"] = resolved_type
        type_changed = resolved_type != category.category_type
    elif "category_type" in data:
        if category.parent_id is not None:
            raise BusinessRuleViolationError(
                "A subcategory's type is locked to its parent category and cannot be "
                "changed directly. Move it under a different-type parent instead.",
                code="category_type_locked_to_parent",
            )
        resolved_type = data["category_type"]
        type_changed = resolved_type != category.category_type

    for field, value in data.items():
        if field in allowed_fields:
            setattr(category, field, value)
    update_fields = [field for field in data if field in allowed_fields]
    if "name" in update_fields:
        category.slug = unique_slug_for(model=Category, text=category.name, instance=category)
        update_fields.append("slug")
    if update_fields:
        category.save(update_fields=update_fields)
    if type_changed:
        _cascade_category_type(category, resolved_type)
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
