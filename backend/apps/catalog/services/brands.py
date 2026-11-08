from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.audit.services.audit import log_action
from apps.catalog.models import Brand
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.params import KIND_STOCK
from apps.common.utils.text import unique_slug_for


def _check_name_free(*, name: str, brand: Brand | None = None) -> None:
    taken = Brand.objects.filter(name=name, kind=KIND_STOCK)
    if brand is not None:
        taken = taken.exclude(pk=brand.pk)
    if taken.exists():
        raise BusinessRuleViolationError(
            "A brand with this name already exists.", code="brand_name_taken"
        )


@transaction.atomic
def create_brand(
    *,
    name: str,
    description: str = "",
    actor=None,
) -> Brand:
    _check_name_free(name=name)
    brand = Brand(
        name=name,
        description=description,
        slug=unique_slug_for(model=Brand, text=name),
    )
    brand.save()
    log_action(
        actor=actor,
        action="brand.created",
        target_type="Brand",
        target_id=brand.id,
        metadata={"name": brand.name},
    )
    return brand


@transaction.atomic
def update_brand(*, brand: Brand, data: dict, actor=None) -> Brand:
    allowed_fields = {"name", "description", "is_active", "image"}
    changed_fields = [field for field in data if field in allowed_fields]
    if "name" in changed_fields:
        _check_name_free(name=data["name"], brand=brand)
    previous_values = {field: getattr(brand, field) for field in changed_fields}
    for field in changed_fields:
        setattr(brand, field, data[field])
    if "name" in changed_fields:
        brand.slug = unique_slug_for(model=Brand, text=brand.name, instance=brand)
        changed_fields.append("slug")
    if changed_fields:
        brand.save(update_fields=changed_fields)
        log_action(
            actor=actor,
            action="brand.updated",
            target_type="Brand",
            target_id=brand.id,
            metadata={
                "fields": changed_fields,
                "previous": {k: str(v) for k, v in previous_values.items()},
            },
        )
    return brand


@transaction.atomic
def delete_brand(*, brand: Brand, actor=None) -> Brand:
    from apps.common.services.soft_delete import soft_delete_instance

    soft_delete_instance(brand, actor=actor)
    log_action(
        actor=actor,
        action="brand.deleted",
        target_type="Brand",
        target_id=brand.id,
        metadata={"name": brand.name},
    )
    return brand


def stage_brand_status(*, brand: Brand, is_active: bool) -> None:
    """Set the status in memory only; the caller writes the whole batch with a
    single `bulk_update`, which does not run `auto_now` on `updated_at`."""
    brand.is_active = is_active
    brand.updated_at = timezone.now()
