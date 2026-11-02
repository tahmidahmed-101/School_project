from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from apps.catalog.models import Brand


def brands_list(
    *,
    include_deleted: bool = False,
    is_active: bool | None = None,
    kind: str | None = None,
) -> QuerySet[Brand]:
    queryset = Brand.objects.all()
    if kind:
        queryset = queryset.filter(kind=kind)
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    if is_active is not None:
        queryset = queryset.filter(is_active=is_active)
    return queryset.order_by("name")


def get_brand_by_id(brand_id: str | UUID, *, include_deleted: bool = False) -> Brand | None:
    queryset = Brand.objects.all()
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    return queryset.filter(id=brand_id).first()


def get_brand_by_slug(slug: str) -> Brand | None:
    return Brand.objects.filter(slug=slug, deleted_at__isnull=True, is_active=True).first()
