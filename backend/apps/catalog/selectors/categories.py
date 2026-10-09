from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from apps.catalog.models import Category


def all_categories(
    *, include_deleted: bool = False, category_type: str | None = None
) -> QuerySet[Category]:
    queryset = Category.objects.all()
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    if category_type:
        queryset = queryset.filter(category_type=category_type)
    return queryset


def active_categories(*, category_type: str | None = None) -> QuerySet[Category]:
    return all_categories(category_type=category_type).filter(is_active=True)


def get_category_by_id(
    category_id: str | UUID, *, include_deleted: bool = False
) -> Category | None:
    return all_categories(include_deleted=include_deleted).filter(id=category_id).first()


def category_ids_with_descendants(category_ids) -> set:
    """The given categories plus every category under them, at any depth, from
    one query over the tree."""
    wanted = set(category_ids)
    if not wanted:
        return wanted
    children: dict = {}
    for child_id, parent_id in all_categories().values_list("id", "parent_id"):
        children.setdefault(parent_id, []).append(child_id)
    pending = list(wanted)
    while pending:
        for child_id in children.get(pending.pop(), ()):
            if child_id not in wanted:
                wanted.add(child_id)
                pending.append(child_id)
    return wanted


def get_category_by_slug(slug: str) -> Category | None:
    return active_categories().filter(slug=slug).first()
