from __future__ import annotations

from django.db import transaction
from django.utils.module_loading import import_string

from apps.business.constants import (
    MODULE_REGISTRY,
    MODULES_BY_KEY,
    ModuleSpec,
    config_defaults,
    config_field,
)
from apps.business.models import ModuleSetting
from apps.business.selectors.modules import (
    get_module_state,
    is_feature_enabled,
    is_module_licensed,
)
from apps.common.exceptions import BusinessRuleViolationError


def require_feature(module_key: str, field_key: str) -> None:
    """Raises when a sub-feature is switched off. Hiding the control is
    presentation; this is what stops a hand-written request."""
    if is_feature_enabled(module_key, field_key):
        return
    field = config_field(module_key, field_key)
    label = field.label if field else field_key
    raise BusinessRuleViolationError(f"{label} is switched off.", code="feature_disabled")


def _refuse_if_in_use(spec: ModuleSpec, previous: dict, merged: dict) -> None:
    """Mirrors the module dependency guards: a sub-feature whose rows would be
    stranded refuses to switch off instead of hiding them."""
    for field in spec.config_fields:
        if not field.disable_guard:
            continue
        if merged.get(field.key) or not previous.get(field.key, field.default):
            continue
        reason = import_string(field.disable_guard)()
        if reason:
            raise BusinessRuleViolationError(reason, code="feature_in_use")


@transaction.atomic
def seed_modules() -> int:
    created = 0
    for spec in MODULE_REGISTRY:
        _, was_created = ModuleSetting.objects.get_or_create(key=spec.key)
        created += int(was_created)
    return created


@transaction.atomic
def set_module_enabled(*, key: str, is_enabled: bool) -> dict:
    spec = MODULES_BY_KEY.get(key)
    if spec is None:
        raise BusinessRuleViolationError("Unknown module.", code="unknown_module")
    if not is_module_licensed(key):
        raise BusinessRuleViolationError(
            f"{spec.label} is not part of your plan.", code="module_not_licensed"
        )
    if not spec.can_disable:
        raise BusinessRuleViolationError(
            spec.locked_reason or f"{spec.label} cannot be switched off.",
            code="module_locked",
        )

    state = get_module_state(key)
    if state is None:
        raise RuntimeError(f"Module state missing for known module key {key!r}.")
    if is_enabled and state["missing_dependencies"]:
        missing = ", ".join(MODULES_BY_KEY[dep].label for dep in state["missing_dependencies"])
        raise BusinessRuleViolationError(
            f"Enable {missing} first — {spec.label} depends on it.",
            code="dependency_disabled",
        )
    if not is_enabled and state["blocking_dependents"]:
        blockers = ", ".join(MODULES_BY_KEY[dep].label for dep in state["blocking_dependents"])
        raise BusinessRuleViolationError(
            f"Disable {blockers} first — it depends on {spec.label}.",
            code="module_has_dependents",
        )

    setting, _ = ModuleSetting.objects.get_or_create(key=key)
    if setting.is_enabled != is_enabled:
        setting.is_enabled = is_enabled
        setting.save(update_fields=["is_enabled"])

    refreshed = get_module_state(key)
    if refreshed is None:
        raise RuntimeError(f"Module state missing for known module key {key!r}.")
    return refreshed


@transaction.atomic
def set_module_config(*, key: str, config: dict) -> dict:
    spec = MODULES_BY_KEY.get(key)
    if spec is None:
        raise BusinessRuleViolationError("Unknown module.", code="unknown_module")
    if not is_module_licensed(key):
        raise BusinessRuleViolationError(
            f"{spec.label} is not part of your plan.", code="module_not_licensed"
        )
    allowed = config_defaults(key)
    unknown = sorted(set(config) - set(allowed))
    if unknown:
        raise BusinessRuleViolationError(
            f"{spec.label} has no setting named {unknown[0]}.", code="unknown_module_setting"
        )

    setting, _ = ModuleSetting.objects.get_or_create(key=key)
    merged = {name: bool(setting.config.get(name, default)) for name, default in allowed.items()}
    merged.update({name: bool(value) for name, value in config.items()})
    _refuse_if_in_use(spec, {n: bool(setting.config.get(n, d)) for n, d in allowed.items()}, merged)
    if merged != setting.config:
        setting.config = merged
        setting.save(update_fields=["config"])

    refreshed = get_module_state(key)
    if refreshed is None:
        raise RuntimeError(f"Module state missing for known module key {key!r}.")
    return refreshed
