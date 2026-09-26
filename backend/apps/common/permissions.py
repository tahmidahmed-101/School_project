"""Permission classes for the admin/staff API.

Object-level ownership convention
---------------------------------
There are deliberately no `IsOwner`-style classes here. DRF only invokes
`has_object_permission` from `get_object()`, and every view in this codebase is
a hand-rolled `APIView` fetching through a selector, so such a class would never
fire while reading like protection that exists.

Customer-facing endpoints scope ownership into the *lookup* instead, making
another user's record indistinguishable from a missing one:
`orders_for_customer(request.user)`, `get_address_for_user(...)`, or an explicit
`if obj.customer_id != request.user.id: return not_found(...)`.

New customer endpoints must follow this and answer `not_found(...)` — never 403
— for a record belonging to someone else.
"""

from __future__ import annotations

from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and (user.is_superuser or user.role == "admin"))


class IsCustomer(BasePermission):
    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.role == "customer")


class IsAdminOrStaffWithPermission(BasePermission):
    required_permission: str | None = None

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False

        if user.is_superuser or user.role == "admin":
            return True

        required_permission = getattr(view, "required_staff_permission", self.required_permission)
        if user.role != "staff" or not required_permission:
            return False

        return user.staff_permissions.filter(
            permission_code=required_permission,
            is_enabled=True,
        ).exists()


def require_staff_permission(code: str) -> type[IsAdminOrStaffWithPermission]:
    """Build a permission class pinned to a single staff permission code.

    Equivalent to setting `required_staff_permission = code` on the view, but
    usable directly in `permission_classes` for views that don't want an
    extra class attribute:

        permission_classes = [require_staff_permission(StaffPermissionCode.USERS_VIEW)]
    """
    return type(
        f"RequireStaffPermission_{code.replace('.', '_')}",
        (IsAdminOrStaffWithPermission,),
        {"required_permission": code},
    )


class IsAdminOrStaffWithAnyPermission(BasePermission):
    required_permissions: tuple[str, ...] = ()

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False

        if user.is_superuser or user.role == "admin":
            return True

        codes = getattr(view, "required_staff_permissions", self.required_permissions)
        if user.role != "staff" or not codes:
            return False

        return user.staff_permissions.filter(
            permission_code__in=codes,
            is_enabled=True,
        ).exists()


def require_any_staff_permission(*codes: str) -> type[IsAdminOrStaffWithAnyPermission]:
    """Like `require_staff_permission`, but passes if the actor holds any one
    of several codes — e.g. a "view" endpoint that both a view-only and a
    manage-level permission should unlock.

        permission_classes = [require_any_staff_permission(VIEW_CODE, MANAGE_CODE)]
    """
    return type(
        f"RequireAnyStaffPermission_{'_'.join(code.replace('.', '_') for code in codes)}",
        (IsAdminOrStaffWithAnyPermission,),
        {"required_permissions": codes},
    )


class ModuleEnabled(BasePermission):
    """Blocks a whole feature area when an operator has switched it off.

    Deliberately separate from the staff-permission classes: those answer "may
    this actor", this answers "does this tenant run this at all". An admin is
    not exempt — a disabled module is off for everyone.
    """

    module_key: str | None = None
    message = "This module is switched off."

    def has_permission(self, request, view) -> bool:
        from apps.business.selectors.modules import is_module_enabled

        key = getattr(view, "required_module", self.module_key)
        if not key:
            return True
        return is_module_enabled(key)


def require_module(key: str) -> type[ModuleEnabled]:
    """Build a permission class pinned to one module key.

    permission_classes = [IsAdmin, require_module(ModuleKey.PROCUREMENT)]
    """
    return type(
        f"RequireModule_{key}",
        (ModuleEnabled,),
        {"module_key": key},
    )
