from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class UUIDModel(models.Model):
    id: models.UUIDField = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class TimeStampedModel(UUIDModel):
    created_at: models.DateTimeField = models.DateTimeField(default=timezone.now, editable=False)
    updated_at: models.DateTimeField = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        # auto_now only fires for fields named in update_fields, so a partial
        # save that forgets it leaves the row's mtime lying about a real change.
        update_fields = kwargs.get("update_fields")
        if update_fields:
            kwargs["update_fields"] = {*update_fields, "updated_at"}
        return super().save(*args, **kwargs)


class SoftDeleteModel(TimeStampedModel):
    deleted_at: models.DateTimeField | None = models.DateTimeField(null=True, blank=True)

    class Meta:
        abstract = True

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    def soft_delete(self) -> None:
        self.deleted_at = timezone.now()
        self.save(update_fields=["deleted_at", "updated_at"])

    def restore(self) -> None:
        self.deleted_at = None
        self.save(update_fields=["deleted_at", "updated_at"])


class ActivatableModel(models.Model):
    """Adds an enable/disable flag independent of soft-delete."""

    is_active: models.BooleanField = models.BooleanField(default=True)

    class Meta:
        abstract = True

    def activate(self) -> None:
        self.is_active = True
        self.save(update_fields=["is_active"])

    def deactivate(self) -> None:
        self.is_active = False
        self.save(update_fields=["is_active"])


class UserStampedModel(models.Model):
    """Adds created_by/updated_by actor tracking. Combine with TimeStampedModel/SoftDeleteModel."""

    created_by: models.ForeignKey = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    updated_by: models.ForeignKey = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        abstract = True


class FullAuditModel(UserStampedModel, ActivatableModel, SoftDeleteModel):
    """Full audit base for new domain models: UUID id, timestamps, soft-delete,
    created_by/updated_by/deleted_by, and an is_active flag.

    Use this (instead of composing the smaller mixins yourself) when a new
    domain model needs the complete audit trail out of the box.
    """

    deleted_by: models.ForeignKey = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        abstract = True

    def soft_delete(self, *, deleted_by: models.Model | None = None) -> None:  # type: ignore[override]
        self.deleted_at = timezone.now()
        update_fields = ["deleted_at", "updated_at"]
        if deleted_by is not None:
            self.deleted_by = deleted_by
            update_fields.append("deleted_by")
        self.save(update_fields=update_fields)

    def restore(self) -> None:  # type: ignore[override]
        self.deleted_at = None
        self.deleted_by = None
        self.save(update_fields=["deleted_at", "deleted_by", "updated_at"])
