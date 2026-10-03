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


def get_category_by_slug(slug: str) -> Category | None:
    return active_categories().filter(slug=slug).first()
