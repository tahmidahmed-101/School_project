from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import StaffPermissionCode
from apps.business.selectors import get_business_profile
from apps.business.selectors.modules import get_module_state, modules_list
from apps.business.services import update_business_profile
from apps.business.services.modules import set_module_config, set_module_enabled
from apps.common.exception_handler import status_for_code
from apps.common.exceptions import DomainError
from apps.common.permissions import require_any_staff_permission, require_staff_permission
from apps.common.responses import error_from_exception, not_found
from apps.orders.selectors.payment_methods import (
    get_payment_method_state,
    payment_methods_list,
)
from apps.orders.services.payment_methods import set_payment_method_enabled

from .serializers import (
    AdminBusinessProfileSerializer,
    AdminBusinessProfileUpdateSerializer,
    AdminIntegrationStatusSerializer,
    AdminModuleSerializer,
    AdminModuleUpdateSerializer,
    AdminPaymentMethodSerializer,
    AdminPaymentMethodUpdateSerializer,
)

SettingsViewPermission = require_any_staff_permission(
    StaffPermissionCode.SETTINGS_VIEW, StaffPermissionCode.SETTINGS_MANAGE
)
SettingsManagePermission = require_staff_permission(StaffPermissionCode.SETTINGS_MANAGE)


def _envelope(profile) -> Response:
    return Response({"data": AdminBusinessProfileSerializer(profile).data, "message": "Success"})


@extend_schema(tags=["Business Settings"])
class AdminBusinessProfileView(APIView):
    serializer_class = AdminBusinessProfileUpdateSerializer
    """Reading is open to `settings.view`; only `settings.manage` may write."""

    def get_permissions(self):
        if self.request.method == "GET":
            return [SettingsViewPermission()]
        return [SettingsManagePermission()]

    def get(self, request) -> Response:
        return _envelope(get_business_profile())

    def patch(self, request) -> Response:
        serializer = AdminBusinessProfileUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        profile = update_business_profile(
            profile=get_business_profile(), data=serializer.validated_data
        )
        return _envelope(profile)

    put = patch


@extend_schema(tags=["Business Settings"])
class AdminModuleListView(APIView):
    serializer_class = AdminModuleSerializer
    permission_classes: ClassVar[list] = [SettingsViewPermission]

    def get(self, request) -> Response:
        return Response(
            {"data": AdminModuleSerializer(modules_list(), many=True).data, "message": "Success"}
        )


@extend_schema(tags=["Business Settings"])
class AdminModuleDetailView(APIView):
    serializer_class = AdminModuleUpdateSerializer
    permission_classes: ClassVar[list] = [SettingsManagePermission]

    def patch(self, request, key: str) -> Response:
        state = get_module_state(key)
        # Unlicensed is a 404, not a 403: the operator was never shown it, and a
        # distinct status would advertise what the plan omits.
        if state is None or not state["is_licensed"]:
            return not_found("module_not_found", "Module not found.")
        serializer = AdminModuleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            if "config" in data:
                state = set_module_config(key=key, config=data["config"])
            else:
                state = set_module_enabled(key=key, is_enabled=data["is_enabled"])
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response({"data": AdminModuleSerializer(state).data, "message": "Success"})


@extend_schema(tags=["Business Settings"])
class AdminIntegrationStatusView(APIView):
    """Read-only. SMS credentials live in the deployment environment, not the
    database, so the UI can report their state but never edit them."""

    serializer_class = AdminIntegrationStatusSerializer
    permission_classes: ClassVar[list] = [SettingsViewPermission]

    def get(self, request) -> Response:
        payload = {
            "sms": {
                "provider": "Twilio",
                "is_configured": bool(settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN),
                "from_number": settings.TWILIO_PHONE_NUMBER,
            }
        }
        return Response(
            {"data": AdminIntegrationStatusSerializer(payload).data, "message": "Success"}
        )


@extend_schema(tags=["Business Settings"])
class AdminPaymentMethodListView(APIView):
    serializer_class = AdminPaymentMethodSerializer
    permission_classes: ClassVar[list] = [SettingsViewPermission]

    def get(self, request) -> Response:
        return Response(
            {
                "data": AdminPaymentMethodSerializer(payment_methods_list(), many=True).data,
                "message": "Success",
            }
        )


@extend_schema(tags=["Business Settings"])
class AdminPaymentMethodDetailView(APIView):
    serializer_class = AdminPaymentMethodUpdateSerializer
    permission_classes: ClassVar[list] = [SettingsManagePermission]

    def patch(self, request, key: str) -> Response:
        if get_payment_method_state(key) is None:
            return not_found("payment_method_not_found", "Payment method not found.")
        serializer = AdminPaymentMethodUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            state = set_payment_method_enabled(
                key=key, is_enabled=serializer.validated_data["is_enabled"]
            )
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response({"data": AdminPaymentMethodSerializer(state).data, "message": "Success"})
