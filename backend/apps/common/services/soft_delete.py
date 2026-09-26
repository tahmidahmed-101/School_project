from __future__ import annotations

from collections.abc import Iterable

from django.db import transaction
from django.db.models import Model

from apps.common.exceptions import BusinessRuleViolationError
from apps.common.models import FullAuditModel, SoftDeleteModel


def ensure_not_referenced(instance: Model, relations: Iterable[str], *, code: str) -> None:
    """Refuse to delete a record other live records still point at.

    `relations` are reverse-accessor names; a related manager exposing
    `deleted_at` is checked for live rows only, so an already soft-deleted
    child never blocks its parent. The `_in_use` suffix on `code` is what
    `status_for_code` turns into a 409.
    """
    for relation in relations:
        manager = getattr(instance, relation, None)
        if manager is None:
            continue
        queryset = manager.all()
        if any(field.name == "deleted_at" for field in queryset.model._meta.get_fields()):
            queryset = queryset.filter(deleted_at__isnull=True)
        if queryset.exists():
            raise BusinessRuleViolationError(
                f"Cannot delete: {queryset.count()} related {relation} still reference it.",
                code=code,
            )


@transaction.atomic
# Generic over the model so callers get their own type back rather than a bare
# Model — the source of most of this project's `Model` vs `X` type errors.
def soft_delete_instance[T: SoftDeleteModel](
    instance: T,
    *,
    actor=None,
    protected_relations: Iterable[str] = (),
    code: str = "in_use",
) -> T:
    ensure_not_referenced(instance, protected_relations, code=code)
    if isinstance(instance, FullAuditModel):
        instance.soft_delete(deleted_by=actor)
    else:
        instance.soft_delete()
    return instance


@transaction.atomic
def restore_instance[T: SoftDeleteModel](instance: T) -> T:
    if instance.deleted_at is None:
        raise BusinessRuleViolationError("This record is not deleted.", code="not_deleted")
    instance.restore()
    return instance
