from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from apps.catalog.models import Category


def all_categories(*, include_deleted: bool = False) -> QuerySet[Category]:
    queryset = Category.objects.all()
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    return queryset


def active_categories() -> QuerySet[Category]:
    return all_categories().filter(is_active=True)


def category_tree() -> QuerySet[Category]:
    return active_categories().filter(parent__isnull=True).prefetch_related("children")


def get_category_by_id(
    category_id: str | UUID, *, include_deleted: bool = False
) -> Category | None:
    return all_categories(include_deleted=include_deleted).filter(id=category_id).first()


def get_category_by_slug(slug: str) -> Category | None:
    return active_categories().filter(slug=slug).first()
