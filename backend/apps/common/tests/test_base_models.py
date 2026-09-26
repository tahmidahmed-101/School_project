from __future__ import annotations

from apps.common.models.base import (
    ActivatableModel,
    FullAuditModel,
    SoftDeleteModel,
    TimeStampedModel,
    UserStampedModel,
    UUIDModel,
)


def _field_names(model_cls) -> set[str]:
    return {field.name for field in model_cls._meta.get_fields()}


def test_uuid_model_has_uuid_primary_key():
    assert "id" in _field_names(UUIDModel)
    assert UUIDModel._meta.get_field("id").editable is False


def test_timestamped_model_has_created_and_updated_at():
    fields = _field_names(TimeStampedModel)
    assert {"created_at", "updated_at"} <= fields


def test_soft_delete_model_has_deleted_at_and_helpers():
    assert "deleted_at" in _field_names(SoftDeleteModel)
    assert hasattr(SoftDeleteModel, "soft_delete")
    assert hasattr(SoftDeleteModel, "is_deleted")


def test_activatable_model_has_is_active_and_helpers():
    assert "is_active" in _field_names(ActivatableModel)
    assert hasattr(ActivatableModel, "activate")
    assert hasattr(ActivatableModel, "deactivate")


def test_user_stamped_model_has_created_by_and_updated_by():
    fields = _field_names(UserStampedModel)
    assert {"created_by", "updated_by"} <= fields


def test_full_audit_model_combines_all_mixins():
    fields = _field_names(FullAuditModel)
    assert {
        "id",
        "created_at",
        "updated_at",
        "deleted_at",
        "is_active",
        "created_by",
        "updated_by",
        "deleted_by",
    } <= fields
    assert hasattr(FullAuditModel, "soft_delete")
