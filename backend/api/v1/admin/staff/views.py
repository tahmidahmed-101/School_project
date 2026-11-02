from __future__ import annotations

from typing import ClassVar

from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.admin.users.views import (
    UsersPermissionMixin,
    _admin_user_data,
    _AdminUserListSerializer,
)
from apps.accounts.constants import StaffPermissionCode
from apps.accounts.selectors.staff_permissions import staff_permission_codes
from apps.accounts.selectors.telegram_links import get_telegram_link
from apps.accounts.selectors.users import get_user_by_id, staff_users
from apps.accounts.services.staff_permissions import replace_staff_permissions
from apps.accounts.services.telegram_links import (
    LINK_CODE_EXPIRY_MINUTES,
    create_telegram_link_code,
    unlink_telegram_account,
)
from apps.accounts.services.users import (
    admin_update_user,
    create_staff_user,
    restore_user,
    soft_delete_user,
)
from apps.common.exceptions import DomainError
from apps.common.generics import filter_search, list_response
from apps.common.params import get_bool
from apps.common.permissions import IsAdmin, require_any_staff_permission
from apps.common.responses import error_from_exception, not_found

from .serializers import (
    StaffCreateSerializer,
    StaffPermissionUpdateSerializer,
    StaffUpdateSerializer,
)

STAFF_SEARCH_FIELDS = ("email", "first_name", "last_name", "phone")


@extend_schema(tags=["Staff"])
class StaffListCreateView(UsersPermissionMixin, APIView):
    @extend_schema(
        operation_id="v1_admin_staff_list",
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Staff list response",
                value={
                    "data": {
                        "results": [
                            {
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
                                "permissions": ["users.view"],
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
        include_deleted = bool(get_bool(request.query_params, "include_deleted", default=False))
        queryset = staff_users(include_inactive=True, include_deleted=include_deleted)
        # With include_deleted, narrows to the deleted accounts (the restore list).
        if get_bool(request.query_params, "deleted_only", default=False):
            queryset = queryset.filter(deleted_at__isnull=False)
        queryset = filter_search(queryset, request, STAFF_SEARCH_FIELDS)
        return list_response(request, queryset, _AdminUserListSerializer, view=self)

    @extend_schema(
        request=StaffCreateSerializer,
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Staff create request",
                value={
                    "email": "staff@example.com",
                    "password": "StrongPass123",
                    "first_name": "Sam",
                    "last_name": "Staff",
                    "phone": "+15550000002",
                    "profile_picture": "",
                    "permissions": ["users.view"],
                },
                request_only=True,
            ),
            OpenApiExample(
                "Staff create response",
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
                        "permissions": ["users.view"],
                    },
                    "message": "Success",
                },
                response_only=True,
            ),
        ],
    )
    def post(self, request) -> Response:
        serializer = StaffCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        permissions = data.pop("permissions", [])
        try:
            user = create_staff_user(
                granted_by=request.user,
                permissions=permissions,
                **data,
            )
        except (DomainError, DjangoValidationError) as exc:
            return error_from_exception(exc)
        return Response(
            {"data": _admin_user_data(user), "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Staff"])
class StaffDetailView(UsersPermissionMixin, APIView):
    serializer_class = StaffUpdateSerializer

    @extend_schema(
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Staff detail response",
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
                        "permissions": ["users.view"],
                    },
                    "message": "Success",
                },
                response_only=True,
            ),
        ],
    )
    def get(self, request, user_id) -> Response:
        user = get_user_by_id(user_id)
        if user is None or user.role != "staff":
            return not_found("staff_not_found", "Staff member not found.")
        return Response({"data": _admin_user_data(user), "message": "Success"})

    @extend_schema(
        request=StaffUpdateSerializer,
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Staff update request",
                value={"last_name": "Team", "is_active": True},
                request_only=True,
            ),
            OpenApiExample(
                "Staff update response",
                value={
                    "data": {
                        "id": "11111111-1111-1111-1111-111111111111",
                        "email": "staff@example.com",
                        "first_name": "Sam",
                        "last_name": "Team",
                        "role": "staff",
                        "phone": "+15550000002",
                        "profile_picture": "",
                        "is_active": True,
                        "is_email_verified": False,
                        "is_superuser": False,
                        "permissions": ["users.view"],
                    },
                    "message": "Success",
                },
                response_only=True,
            ),
        ],
    )
    def patch(self, request, user_id) -> Response:
        user = get_user_by_id(user_id)
        if user is None or user.role != "staff":
            return not_found("staff_not_found", "Staff member not found.")
        serializer = StaffUpdateSerializer(data=request.data, partial=True)
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
        user = get_user_by_id(user_id)
        if user is None or user.role != "staff":
            return not_found("staff_not_found", "Staff member not found.")
        try:
            soft_delete_user(actor=request.user, target_user=user)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": {}, "message": "Success"})


@extend_schema(tags=["Staff"])
class StaffRestoreView(UsersPermissionMixin, APIView):
    @extend_schema(request=None, responses=OpenApiTypes.OBJECT)
    def post(self, request, user_id) -> Response:
        user = get_user_by_id(user_id, include_deleted=True)
        if user is None or user.role != "staff":
            return not_found("staff_not_found", "Staff member not found.")
        try:
            restore_user(actor=request.user, target_user=user)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": _admin_user_data(user), "message": "Success"})


@extend_schema(tags=["Staff"])
class StaffPermissionCodeListView(APIView):
    permission_classes: ClassVar[list] = [IsAdmin]

    @extend_schema(
        operation_id="v1_admin_staff_permission_codes",
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Permission codes response",
                value={
                    "data": [
                        {
                            "id": "users.view",
                            "code": "users.view",
                            "label": "View users",
                            "domain": "users",
                            "domain_label": "Users",
                        }
                    ],
                    "message": "Success",
                },
                response_only=True,
            ),
        ],
    )
    def get(self, request) -> Response:
        return Response({"data": staff_permission_codes(), "message": "Success"})


@extend_schema(tags=["Staff"])
class StaffPermissionsView(APIView):
    permission_classes: ClassVar[list] = [IsAdmin]

    @extend_schema(
        request=StaffPermissionUpdateSerializer,
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Staff permissions request",
                value={"permissions": ["users.view", "reports.view"]},
                request_only=True,
            ),
            OpenApiExample(
                "Staff permissions response",
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
                        "permissions": ["users.view"],
                    },
                    "message": "Success",
                },
                response_only=True,
            ),
        ],
    )
    def patch(self, request, user_id) -> Response:
        user = get_user_by_id(user_id)
        if user is None or user.role != "staff":
            return not_found("staff_not_found", "Staff member not found.")
        serializer = StaffPermissionUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            replace_staff_permissions(
                staff_user=user,
                permission_codes=serializer.validated_data["permissions"],
                granted_by=request.user,
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": _admin_user_data(user), "message": "Success"})


OrdersStaffPermission = require_any_staff_permission(
    StaffPermissionCode.ORDERS_VIEW, StaffPermissionCode.ORDERS_MANAGE
)


@extend_schema(tags=["Staff"])
class StaffTelegramLinkView(APIView):
    """The signed-in staff member's own Telegram link. POST hands back a
    single-use code to send to the bot; the code is shown once and only its
    hash is kept. The bot only serves order staff, so linking needs an order
    permission."""

    permission_classes: ClassVar[list] = [OrdersStaffPermission]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request) -> Response:
        link = get_telegram_link(request.user)
        return Response(
            {
                "data": {
                    "linked": link is not None,
                    "linked_at": link.updated_at if link else None,
                },
                "message": "Success",
            }
        )

    @extend_schema(request=None, responses=OpenApiTypes.OBJECT)
    def post(self, request) -> Response:
        code = create_telegram_link_code(user=request.user)
        return Response(
            {
                "data": {"code": code, "expires_in_minutes": LINK_CODE_EXPIRY_MINUTES},
                "message": "Success",
            },
            status=status.HTTP_201_CREATED,
        )

    def delete(self, request) -> Response:
        unlink_telegram_account(user=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)
