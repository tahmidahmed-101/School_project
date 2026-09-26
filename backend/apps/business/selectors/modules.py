from __future__ import annotations

from apps.business.constants import (
    MODULE_REGISTRY,
    MODULES_BY_KEY,
    ModuleSpec,
    config_defaults,
    dependents_of,
)
from apps.business.models import ModuleSetting


def _licensed_map() -> dict[str, bool]:
    stored = dict(ModuleSetting.objects.values_list("key", "is_licensed"))
    return {
        spec.key: True if not spec.can_disable else stored.get(spec.key, True)
        for spec in MODULE_REGISTRY
    }


def _enabled_map() -> dict[str, bool]:
    """Licensing folded in, so an unlicensed module is off to every caller —
    dependency checks and the middleware included — not merely hidden."""
    stored = dict(ModuleSetting.objects.values_list("key", "is_enabled"))
    licensed = _licensed_map()
    return {spec.key: licensed[spec.key] and stored.get(spec.key, True) for spec in MODULE_REGISTRY}


def is_module_licensed(key: str) -> bool:
    if key not in MODULES_BY_KEY:
        return True
    return _licensed_map().get(key, True)


def is_module_enabled(key: str) -> bool:
    """Unknown keys are treated as enabled: a module that predates the registry
    must not become unreachable just because nobody has listed it yet."""
    if key not in MODULES_BY_KEY:
        return True
    spec = MODULES_BY_KEY[key]
    if not spec.can_disable:
        return True
    return _enabled_map().get(key, True)


def enabled_module_keys() -> set[str]:
    enabled = _enabled_map()
    return {spec.key for spec in MODULE_REGISTRY if not spec.can_disable or enabled[spec.key]}


def is_feature_enabled(module_key: str, field_key: str) -> bool:
    """A sub-feature is off whenever its module is, so callers guard one thing.
    An unknown field reads as on: a flag not yet in the registry must not
    silently switch a working feature off."""
    if not is_module_enabled(module_key):
        return False
    if field_key not in config_defaults(module_key):
        return True
    return bool(module_config(module_key).get(field_key, True))


def _config_map() -> dict[str, dict]:
    return dict(ModuleSetting.objects.values_list("key", "config"))


def module_config(key: str) -> dict[str, bool]:
    """Stored values layered over the registry defaults, so a field added to the
    registry later reads as its default instead of missing."""
    defaults = config_defaults(key)
    stored = ModuleSetting.objects.filter(key=key).values_list("config", flat=True).first() or {}
    return {name: bool(stored.get(name, default)) for name, default in defaults.items()}


def module_state(
    spec: ModuleSpec,
    enabled: dict[str, bool],
    configs: dict[str, dict],
    licensed: dict[str, bool],
) -> dict:
    blocking_dependents = tuple(
        key
        for key in dependents_of(spec.key)
        if not MODULES_BY_KEY[key].can_disable or enabled[key]
    )
    missing_dependencies = tuple(
        key for key in spec.depends_on if MODULES_BY_KEY[key].can_disable and not enabled[key]
    )
    return {
        "key": spec.key,
        "label": spec.label,
        "is_licensed": licensed[spec.key],
        "description": spec.description,
        "is_enabled": True if not spec.can_disable else enabled[spec.key],
        "can_disable": spec.can_disable,
        "locked_reason": spec.locked_reason,
        "depends_on": list(spec.depends_on),
        "dependents": list(dependents_of(spec.key)),
        "blocking_dependents": list(blocking_dependents),
        "missing_dependencies": list(missing_dependencies),
        "permission_codes": list(spec.permission_codes),
        "config_fields": [
            {
                "key": f.key,
                "label": f.label,
                "description": f.description,
                "value": bool((configs.get(spec.key) or {}).get(f.key, f.default)),
            }
            for f in spec.config_fields
        ],
    }


def modules_list() -> list[dict]:
    """Unlicensed modules are omitted, not shown switched off: the operator never
    bought them, so surfacing them would only raise support tickets."""
    enabled = _enabled_map()
    configs = _config_map()
    licensed = _licensed_map()
    return [
        module_state(spec, enabled, configs, licensed)
        for spec in MODULE_REGISTRY
        if licensed[spec.key]
    ]


def get_module_state(key: str) -> dict | None:
    spec = MODULES_BY_KEY.get(key)
    if spec is None:
        return None
    return module_state(spec, _enabled_map(), _config_map(), _licensed_map())
