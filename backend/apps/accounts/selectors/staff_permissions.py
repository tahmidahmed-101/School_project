from __future__ import annotations

from apps.accounts.constants import StaffPermissionCode


def _domain_label(domain: str) -> str:
    return domain.replace("_", " ").capitalize()


def staff_permission_codes() -> list[dict]:
    """The single source of truth for the admin UI's permission picker, so it
    can't drift from `StaffPermissionCode` the way a hardcoded copy does."""
    return [
        {
            "id": code,
            "code": code,
            "label": label,
            "domain": code.split(".", 1)[0],
            "domain_label": _domain_label(code.split(".", 1)[0]),
        }
        for code, label in StaffPermissionCode.choices
    ]
