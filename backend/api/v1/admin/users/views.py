from __future__ import annotations

from typing import ClassVar

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import UserRole
from apps.accounts.selectors.users import (
    get_user_by_id,
    user_contact_phone,
    user_display_name,
    user_permissions,
    users_list,
)
from apps.accounts.services.addresses import create_address
from apps.accounts.services.users import (
    activate_user,
    admin_update_user,
    create_user,
    deactivate_user,
    reset_user_password,
    restore_user,
    set_user_role,
    soft_delete_user,
)
from apps.common.exceptions import DomainError
from apps.common.generics import BulkActionMixin, list_response
from apps.common.params import get_bool, get_choice, get_search
from apps.common.permissions import IsAdmin
from apps.common.responses import error_from_exception, not_found

from .serializers import (
    AdminAddressSerializer,
    AdminUserCreateSerializer,
    AdminUserSerializer,
    AdminUserUpdateSerializer,
    BulkUserIdsSerializer,
    PasswordResetSerializer,
    SetRoleSerializer,
)


class UsersPermissionMixin:
    """User management is privilege-escalation-sensitive and stays admin-only —
    never delegable via a staff permission code, on GET or otherwise."""

    permission_classes: ClassVar[list] = [IsAdmin]


def _admin_user_data(user) -> dict:
    return AdminUserSerializer(
        {
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "display_name": user_display_name(user),
            "role": user.role,
            "phone": user.phone,
            "contact_phone": user_contact_phone(user),
            "profile_picture": user.profile_picture,
            "is_active": user.is_active,
            "is_email_verified": user.is_email_verified,
            "is_phone_verified": user.is_phone_verified,
            "is_superuser": user.is_superuser,
            "is_guest": user.is_guest,
            "date_joined": user.date_joined,
            "last_login": user.last_login,
            "permissions": user_permissions(user),
            "deleted_at": user.deleted_at,
        }
    ).data


def _get_target(user_id):
    return get_user_by_id(user_id, include_deleted=False)


class _AdminUserListSerializer(serializers.BaseSerializer):
    def to_representation(self, instance) -> dict:
        return _admin_user_data(instance)


@extend_schema(tags=["Users"])
class AdminUserListCreateView(UsersPermissionMixin, APIView):
    @extend_schema(
        operation_id="v1_admin_users_list",
        responses=dict,
        examples=[
            OpenApiExample(
                "Admin user list response",
                value={
                    "data": {
                        "results": [
                            {
                                "id": "11111111-1111-1111-1111-111111111111",
                                "email": "admin@example.com",
                                "first_name": "Admin",
                                "last_name": "User",
                                "role": "admin",
                                "phone": "+15550000001",
                                "profile_picture": "",
                                "is_active": True,
                                "is_email_verified": True,
                                "is_superuser": False,
                                "permissions": ["users.manage"],
                            }
                        ],
                        "count": 1,
                        "next": None,
                        "previous": None,
                    },
                    "message": "Success",
                },
                response_only=True,
            ),
        ],
    )
    def get(self, request) -> Response:
        params = request.query_params
        queryset = users_list(
            role=get_choice(params, "role", UserRole.values),
            is_active=get_bool(params, "is_active"),
            search=get_search(params),
            include_deleted=bool(get_bool(params, "include_deleted", default=False)),
        )
        return list_response(request, queryset, _AdminUserListSerializer, view=self)

    @extend_schema(
        request=AdminUserCreateSerializer,
        responses=dict,
        examples=[
            OpenApiExample(
                "Admin user create request",
                value={
                    "email": "staff@example.com",
                    "password": "StrongPass123",
                    "role": "staff",
                    "first_name": "Sam",
                    "last_name": "Staff",
                    "phone": "+15550000002",
                    "profile_picture": "",
                    "is_active": True,
                },
                request_only=True,
            ),
            OpenApiExample(
                "Admin user create response",
                value={
                    "data": {
                        "id": "11111111-1111-1111-1111-111111111111",
                        "email": "staff@example.com",
                        "first_name": "Sam",
                        "last_name": "Staff",
                        "role": "staff",
                        "phone": "+15550000002",
                        "profile_picture": "",
                        "is_active": True,
                        "is_email_verified": False,
                        "is_superuser": False,
                        "permissions": [],
                    },
                    "message": "Success",
                },
                response_only=True,
            ),
        ],
    )
    def post(self, request) -> Response:
        serializer = AdminUserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = create_user(**serializer.validated_data)
        except (DomainError, DjangoValidationError) as exc:
            return error_from_exception(exc)
        return Response(
            {"data": _admin_user_data(user), "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Users"])
@extend_schema(tags=["Users"])
class AdminUserAddressListView(UsersPermissionMixin, APIView):
    """Lets order-editing UIs offer a real address picker instead of asking an
    operator to type a UUID."""

    @extend_schema(operation_id="v1_admin_user_addresses_list", responses=dict)
    def get(self, request, user_id) -> Response:
        user = _get_target(user_id)
        if user is None:
            return not_found("user_not_found", "User not found.")
        addresses = user.addresses.filter(deleted_at__isnull=True).order_by(
            "-is_default", "created_at"
        )
        return Response(
            {
                "data": AdminAddressSerializer(addresses, many=True).data,
                "message": "Success",
            }
        )

    @extend_schema(
        operation_id="v1_admin_user_addresses_create",
        request=AdminAddressSerializer,
        responses=dict,
    )
    def post(self, request, user_id) -> Response:
        user = _get_target(user_id)
        if user is None:
            return not_found("user_not_found", "User not found.")
        serializer = AdminAddressSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        address = create_address(user=user, data=serializer.validated_data)
        return Response(
            {
                "data": AdminAddressSerializer(address).data,
                "message": "Success",
            },
            status=status.HTTP_201_CREATED,
        )


class AdminUserDetailView(UsersPermissionMixin, APIView):
    serializer_class = AdminUserUpdateSerializer

    @extend_schema(
        responses=dict,
        examples=[
            OpenApiExample(
                "Admin user detail response",
                value={
                    "data": {
                        "id": "11111111-1111-1111-1111-111111111111",
                        "email": "admin@example.com",
                        "first_name": "Admin",
                        "last_name": "User",
                        "role": "admin",
                        "phone": "+15550000001",
                        "profile_picture": "",
                        "is_active": True,
                        "is_email_verified": True,
                        "is_superuser": False,
                        "permissions": ["users.manage"],
                    },
                    "message": "Success",
                },
                response_only=True,
            ),
        ],
    )
    def get(self, request, user_id) -> Response:
        user = _get_target(user_id)
        if user is None:
            return not_found("user_not_found", "User not found.")
        data = _admin_user_data(user)
        from apps.orders.selectors.sales_orders import customer_order_summary

        data["order_summary"] = customer_order_summary(user)
        return Response({"data": data, "message": "Success"})

    @extend_schema(
        request=AdminUserUpdateSerializer,
        responses=dict,
        examples=[
            OpenApiExample(
                "Admin user update request",
                value={"last_name": "Manager", "is_active": True},
                request_only=True,
            ),
            OpenApiExample(
                "Admin user update response",
                value={
                    "data": {
                        "id": "11111111-1111-1111-1111-111111111111",
                        "email": "admin@example.com",
                        "first_name": "Admin",
                        "last_name": "Manager",
                        "role": "admin",
                        "phone": "+15550000001",
                        "profile_picture": "",
                        "is_active": True,
                        "is_email_verified": True,
                        "is_superuser": False,
                        "permissions": ["users.manage"],
                    },
                    "message": "Success",
                },
                response_only=True,
            ),
        ],
    )
    def patch(self, request, user_id) -> Response:
        user = _get_target(user_id)
        if user is None:
            return not_found("user_not_found", "User not found.")
        serializer = AdminUserUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            user = admin_update_user(
                actor=request.user,
                target_user=user,
                data=serializer.validated_data,
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": _admin_user_data(user), "message": "Success"})

    def delete(self, request, user_id) -> Response:
        user = _get_target(user_id)
        if user is None:
            return not_found("user_not_found", "User not found.")
        try:
            soft_delete_user(actor=request.user, target_user=user)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": {}, "message": "Success"})


@extend_schema(tags=["Users"])
class AdminUserRestoreView(APIView):
    permission_classes: ClassVar[list] = [IsAdmin]

    @extend_schema(request=None, responses=OpenApiTypes.OBJECT)
    def post(self, request, user_id) -> Response:
        user = get_user_by_id(user_id, include_deleted=True)
        if user is None:
            return not_found("user_not_found", "User not found.")
        try:
            restore_user(actor=request.user, target_user=user)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": _admin_user_data(user), "message": "Success"})


@extend_schema(tags=["Users"])
class AdminUserActionView(APIView):
    permission_classes: ClassVar[list] = [IsAdmin]
    action = ""

    @extend_schema(
        request=None,
        responses=dict,
        examples=[
            OpenApiExample(
                "Admin user action response",
                value={
                    "data": {
                        "id": "11111111-1111-1111-1111-111111111111",
                        "email": "admin@example.com",
                        "first_name": "Admin",
                        "last_name": "User",
                        "role": "admin",
                        "phone": "+15550000001",
                        "profile_picture": "",
                        "is_active": True,
                        "is_email_verified": True,
                        "is_superuser": False,
                        "permissions": ["users.manage"],
                    },
                    "message": "Success",
                },
                response_only=True,
            ),
        ],
    )
    def post(self, request, user_id) -> Response:
        user = _get_target(user_id)
        if user is None:
            return not_found("user_not_found", "User not found.")
        try:
            if self.action == "activate":
                user = activate_user(actor=request.user, target_user=user)
            elif self.action == "deactivate":
                user = deactivate_user(actor=request.user, target_user=user)
            elif self.action == "soft_delete":
                user = soft_delete_user(actor=request.user, target_user=user)
            else:
                return not_found("unknown_action", "Unknown action.")
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": _admin_user_data(user), "message": "Success"})


@extend_schema(tags=["Users"])
class AdminUserBulkDeactivateView(BulkActionMixin, APIView):
    permission_classes: ClassVar[list] = [IsAdmin]

    @extend_schema(
        request=BulkUserIdsSerializer,
        responses=dict,
        examples=[
            OpenApiExample(
                "Bulk deactivate response",
                value={"data": {"affected": 2}, "message": "Success"},
                response_only=True,
            ),
        ],
    )
    def post(self, request) -> Response:
        try:
            # All-or-nothing: one rejected target (self, last admin) must not
            # leave the rest of the batch deactivated.
            with transaction.atomic():
                return self.bulk_action(
                    request,
                    queryset_fn=lambda: users_list(),
                    action_fn=lambda user: deactivate_user(actor=request.user, target_user=user),
                )
        except DomainError as exc:
            return error_from_exception(exc)


@extend_schema(tags=["Users"])
class AdminResetPasswordView(APIView):
    permission_classes: ClassVar[list] = [IsAdmin]

    @extend_schema(
        request=PasswordResetSerializer,
        responses=dict,
        examples=[
            OpenApiExample(
                "Admin reset password request",
                value={"new_password": "NewStrongPass123"},
                request_only=True,
            ),
            OpenApiExample(
                "Admin reset password response",
                value={"data": {}, "message": "Password reset successful."},
                response_only=True,
            ),
        ],
    )
    def post(self, request, user_id) -> Response:
        user = _get_target(user_id)
        if user is None:
            return not_found("user_not_found", "User not found.")
        serializer = PasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            reset_user_password(
                actor=request.user,
                target_user=user,
                new_password=serializer.validated_data["new_password"],
            )
        except (DomainError, DjangoValidationError) as exc:
            return error_from_exception(exc)
        return Response({"data": {}, "message": "Password reset successful."})


@extend_schema(tags=["Users"])
class AdminSetRoleView(APIView):
    permission_classes: ClassVar[list] = [IsAdmin]

    @extend_schema(
        request=SetRoleSerializer,
        responses=dict,
        examples=[
            OpenApiExample(
                "Admin set role request",
                value={"role": "staff"},
                request_only=True,
            ),
            OpenApiExample(
                "Admin set role response",
                value={
                    "data": {
                        "id": "11111111-1111-1111-1111-111111111111",
                        "email": "staff@example.com",
                        "first_name": "Sam",
                        "last_name": "Staff",
                        "role": "staff",
                        "phone": "+15550000002",
                        "profile_picture": "",
                        "is_active": True,
                        "is_email_verified": False,
                        "is_superuser": False,
                        "permissions": [],
                    },
                    "message": "Success",
                },
                response_only=True,
            ),
        ],
    )
    def post(self, request, user_id) -> Response:
        user = _get_target(user_id)
        if user is None:
            return not_found("user_not_found", "User not found.")
        serializer = SetRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = set_user_role(
                actor=request.user,
                target_user=user,
                role=serializer.validated_data["role"],
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": _admin_user_data(user), "message": "Success"})
