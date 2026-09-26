from __future__ import annotations

from django.contrib.auth.models import Group

from apps.accounts.constants import UserRole
from apps.accounts.models import User

ROLE_GROUP_NAMES = {
    UserRole.ADMIN: "Admin",
    UserRole.STAFF: "Staff",
    UserRole.CUSTOMER: "Customer",
}


def sync_role_group(user: User) -> None:
    """Keep the user's Django auth Group membership in sync with `user.role`.

    This lets standard Django Group/Permission tooling (admin site,
    `user.has_perm(...)`) work alongside the custom `role` field and
    `StaffPermission` model, for projects that prefer group-based permission
    assignment for some resources.
    """
    target_name = ROLE_GROUP_NAMES.get(user.role)
    target_group = None
    if target_name:
        target_group, _ = Group.objects.get_or_create(name=target_name)

    other_group_names = [name for name in ROLE_GROUP_NAMES.values() if name != target_name]
    if other_group_names:
        user.groups.remove(*Group.objects.filter(name__in=other_group_names))
    if target_group is not None:
        user.groups.add(target_group)
