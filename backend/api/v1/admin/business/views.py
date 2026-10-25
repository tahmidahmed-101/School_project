from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiExample, OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import StaffPermissionCode
from apps.business.models import PolicyKind, PromotionPopup
from apps.business.selectors import get_business_profile
from apps.business.selectors.email_settings import email_state
from apps.business.selectors.modules import get_module_state, modules_list
from apps.business.selectors.policies import (
    get_store_policy,
    policy_revisions,
    store_policies_list,
)
from apps.business.selectors.storefront_content import (
    get_hero_slide,
    get_promo_line,
    get_promotion_popup,
    hero_slides_list,
    promo_lines_list,
    promotion_popups_list,
)
from apps.business.services import update_business_profile, update_store_policy
from apps.business.services.email_settings import (
    reset_smtp_settings,
    save_smtp_settings,
    send_test_email,
)
from apps.business.services.modules import set_module_config, set_module_enabled
from apps.business.services.storefront_content import (
    PromotionPopupFieldError,
    create_hero_slide,
    create_promo_line,
    create_promotion_popup,
    delete_hero_slide,
    delete_promo_line,
    delete_promotion_popup,
    update_hero_slide,
    update_promo_line,
    update_promotion_popup,
)
from apps.common.exception_handler import status_for_code
from apps.common.exceptions import DomainError
from apps.common.generics import GenericListAPIView
from apps.common.params import KIND_STOCK, get_kind
from apps.common.permissions import (
    IsStaffMember,
    require_any_staff_permission,
    require_staff_permission,
)
from apps.common.responses import error_from_exception, error_response, not_found
from apps.common.throttling import EmailTestRateThrottle
from apps.marketing.models import ConversionEvent
from apps.marketing.selectors.conversion_settings import provider_states
from apps.marketing.services.conversion_settings import (
    reset_provider_settings,
    save_provider_settings,
)
from apps.orders.selectors.payment_methods import (
    get_payment_method_state,
    payment_methods_list,
)
from apps.orders.services.payment_methods import (
    set_payment_method_enabled,
    set_payment_method_pay_to,
)

from .serializers import (
    AdminBusinessProfileSerializer,
    AdminBusinessProfileUpdateSerializer,
    AdminConversionProviderSerializer,
    AdminConversionProviderUpdateSerializer,
    AdminEmailSettingsSerializer,
    AdminEmailSettingsUpdateSerializer,
    AdminEmailTestResultSerializer,
    AdminEmailTestSerializer,
    AdminHeroSlideSerializer,
    AdminHeroSlideWriteSerializer,
    AdminIntegrationStatusSerializer,
    AdminModuleSerializer,
    AdminModuleUpdateSerializer,
    AdminPaymentMethodSerializer,
    AdminPaymentMethodUpdateSerializer,
    AdminPromoLineSerializer,
    AdminPromoLineWriteSerializer,
    AdminPromotionPopupSerializer,
    AdminPromotionPopupWriteSerializer,
    AdminStorePolicyRevisionSerializer,
    AdminStorePolicySerializer,
    AdminStorePolicyUpdateSerializer,
)

SettingsViewPermission = require_any_staff_permission(
    StaffPermissionCode.SETTINGS_VIEW, StaffPermissionCode.SETTINGS_MANAGE
)
SettingsManagePermission = require_staff_permission(StaffPermissionCode.SETTINGS_MANAGE)


POLICY_KIND_PARAMETER = OpenApiParameter(
    "kind",
    OpenApiTypes.STR,
    location=OpenApiParameter.PATH,
    enum=PolicyKind.values,
    description="Which store policy.",
)


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
    # Any staff member, not only settings.view: the dashboard hides the pages of
    # a switched-off module for everyone, so everyone needs to know which are off.
    permission_classes: ClassVar[list] = [IsStaffMember]

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
        kind = get_kind(request.query_params) or KIND_STOCK
        return Response(
            {
                "data": AdminPaymentMethodSerializer(
                    payment_methods_list(kind=kind), many=True
                ).data,
                "message": "Success",
            }
        )


@extend_schema(tags=["Business Settings"])
class AdminPaymentMethodDetailView(APIView):
    serializer_class = AdminPaymentMethodUpdateSerializer
    permission_classes: ClassVar[list] = [SettingsManagePermission]

    def patch(self, request, key: str) -> Response:
        kind = get_kind(request.query_params) or KIND_STOCK
        if get_payment_method_state(key, kind=kind) is None:
            return not_found("payment_method_not_found", "Payment method not found.")
        serializer = AdminPaymentMethodUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            data = serializer.validated_data
            state = get_payment_method_state(key, kind=kind)
            if "is_enabled" in data:
                state = set_payment_method_enabled(
                    key=key, is_enabled=data["is_enabled"], kind=kind
                )
            if "pay_to" in data:
                state = set_payment_method_pay_to(key=key, pay_to=data["pay_to"], kind=kind)
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response({"data": AdminPaymentMethodSerializer(state).data, "message": "Success"})


@extend_schema(tags=["Business Settings"])
class AdminStorePolicyListView(APIView):
    """Every store policy (shipping, returns, refund, pre-order checkout
    terms), drafts included."""

    serializer_class = AdminStorePolicySerializer
    permission_classes: ClassVar[list] = [SettingsViewPermission]

    def get(self, request) -> Response:
        return Response(
            {
                "data": AdminStorePolicySerializer(store_policies_list(), many=True).data,
                "message": "Success",
            }
        )


@extend_schema(tags=["Business Settings"], parameters=[POLICY_KIND_PARAMETER])
class AdminStorePolicyDetailView(APIView):
    """Reading is open to `settings.view`; editing or publishing needs
    `settings.manage`. Every accepted change records a revision."""

    serializer_class = AdminStorePolicyUpdateSerializer

    def get_permissions(self):
        if self.request.method == "GET":
            return [SettingsViewPermission()]
        return [SettingsManagePermission()]

    def get(self, request, kind) -> Response:
        policy = get_store_policy(kind)
        if policy is None:
            return not_found("policy_not_found", "Unknown policy.")
        return Response({"data": AdminStorePolicySerializer(policy).data, "message": "Success"})

    def patch(self, request, kind) -> Response:
        policy = get_store_policy(kind)
        if policy is None:
            return not_found("policy_not_found", "Unknown policy.")
        serializer = AdminStorePolicyUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            update_store_policy(policy=policy, actor=request.user, data=serializer.validated_data)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": AdminStorePolicySerializer(get_store_policy(kind)).data, "message": "Success"}
        )

    put = patch


@extend_schema(tags=["Business Settings"], parameters=[POLICY_KIND_PARAMETER])
class AdminStorePolicyRevisionListView(GenericListAPIView):
    """Immutable change history for one policy, newest first."""

    serializer_class = AdminStorePolicyRevisionSerializer
    permission_classes: ClassVar[list] = [SettingsViewPermission]
    ordering_fields = ("created_at",)
    default_ordering = "-created_at"

    def get_queryset(self):
        return policy_revisions(self._policy)

    def get(self, request, kind) -> Response:
        policy = get_store_policy(kind)
        if policy is None:
            return not_found("policy_not_found", "Unknown policy.")
        self._policy = policy
        return self.list_response(request)


def _hero_slide_response(request, slide, status_code: int = status.HTTP_200_OK) -> Response:
    data = AdminHeroSlideSerializer(slide, context={"request": request}).data
    return Response({"data": data, "message": "Success"}, status=status_code)


@extend_schema(tags=["Business Settings"])
class AdminHeroSlideListView(APIView):
    """Storefront hero slides, inactive ones included. Create is multipart."""

    serializer_class = AdminHeroSlideWriteSerializer

    def get_permissions(self):
        if self.request.method == "GET":
            return [SettingsViewPermission()]
        return [SettingsManagePermission()]

    def get(self, request) -> Response:
        data = AdminHeroSlideSerializer(
            hero_slides_list(), many=True, context={"request": request}
        ).data
        return Response({"data": data, "message": "Success"})

    def post(self, request) -> Response:
        serializer = AdminHeroSlideWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            slide = create_hero_slide(data=serializer.validated_data)
        except DomainError as exc:
            return error_from_exception(exc)
        return _hero_slide_response(request, slide, status.HTTP_201_CREATED)


@extend_schema(tags=["Business Settings"])
class AdminHeroSlideDetailView(APIView):
    serializer_class = AdminHeroSlideWriteSerializer
    permission_classes: ClassVar[list] = [SettingsManagePermission]

    def patch(self, request, pk) -> Response:
        slide = get_hero_slide(pk)
        if slide is None:
            return not_found("hero_slide_not_found", "Hero slide not found.")
        serializer = AdminHeroSlideWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            slide = update_hero_slide(slide=slide, data=serializer.validated_data)
        except DomainError as exc:
            return error_from_exception(exc)
        return _hero_slide_response(request, slide)

    def delete(self, request, pk) -> Response:
        slide = get_hero_slide(pk)
        if slide is None:
            return not_found("hero_slide_not_found", "Hero slide not found.")
        delete_hero_slide(slide=slide)
        return Response({"data": {}, "message": "Success"})


@extend_schema(tags=["Business Settings"])
class AdminPromoLineListView(APIView):
    """Promo strip lines, inactive ones included."""

    serializer_class = AdminPromoLineWriteSerializer

    def get_permissions(self):
        if self.request.method == "GET":
            return [SettingsViewPermission()]
        return [SettingsManagePermission()]

    def get(self, request) -> Response:
        data = AdminPromoLineSerializer(promo_lines_list(), many=True).data
        return Response({"data": data, "message": "Success"})

    def post(self, request) -> Response:
        serializer = AdminPromoLineWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        line = create_promo_line(data=serializer.validated_data)
        return Response(
            {"data": AdminPromoLineSerializer(line).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Business Settings"])
class AdminPromoLineDetailView(APIView):
    serializer_class = AdminPromoLineWriteSerializer
    permission_classes: ClassVar[list] = [SettingsManagePermission]

    def patch(self, request, pk) -> Response:
        line = get_promo_line(pk)
        if line is None:
            return not_found("promo_line_not_found", "Promo line not found.")
        serializer = AdminPromoLineWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        line = update_promo_line(line=line, data=serializer.validated_data)
        return Response({"data": AdminPromoLineSerializer(line).data, "message": "Success"})

    def delete(self, request, pk) -> Response:
        line = get_promo_line(pk)
        if line is None:
            return not_found("promo_line_not_found", "Promo line not found.")
        delete_promo_line(line=line)
        return Response({"data": {}, "message": "Success"})


def _promotion_popup_response(request, popup_id, status_code: int = status.HTTP_200_OK) -> Response:
    # Re-read, so the sale is the one now saved.
    data = AdminPromotionPopupSerializer(
        get_promotion_popup(popup_id), context={"request": request}
    ).data
    return Response({"data": data, "message": "Success"}, status=status_code)


def _promotion_popup_error(exc: DomainError) -> Response:
    """A broken rule that belongs to one field is reported against it, so the
    form can mark that field."""
    if isinstance(exc, PromotionPopupFieldError):
        return error_response(exc.code, exc.message, fields={exc.field: [exc.message]})
    return error_from_exception(exc, status_for_code(exc.code))


@extend_schema(tags=["Business Settings"])
class AdminPromotionPopupListView(APIView):
    """Promotion popups, drafts, paused and expired ones included, in the order
    the storefront prefers them. Create is multipart (it carries the image)."""

    serializer_class = AdminPromotionPopupWriteSerializer

    def get_permissions(self):
        if self.request.method == "GET":
            return [SettingsViewPermission()]
        return [SettingsManagePermission()]

    def get(self, request) -> Response:
        shop = request.query_params.get("shop")
        if shop not in (None, *PromotionPopup.Shop.values):
            return error_response(
                "invalid_shop", "Unknown shop.", fields={"shop": ["Unknown shop."]}
            )
        data = AdminPromotionPopupSerializer(
            promotion_popups_list(shop=shop), many=True, context={"request": request}
        ).data
        return Response({"data": data, "message": "Success"})

    def post(self, request) -> Response:
        serializer = AdminPromotionPopupWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            popup = create_promotion_popup(data=serializer.validated_data)
        except DomainError as exc:
            return _promotion_popup_error(exc)
        return _promotion_popup_response(request, popup.id, status.HTTP_201_CREATED)


@extend_schema(tags=["Business Settings"])
class AdminPromotionPopupDetailView(APIView):
    serializer_class = AdminPromotionPopupWriteSerializer

    def get_permissions(self):
        if self.request.method == "GET":
            return [SettingsViewPermission()]
        return [SettingsManagePermission()]

    def get(self, request, pk) -> Response:
        if get_promotion_popup(pk) is None:
            return not_found("promotion_popup_not_found", "Promotion popup not found.")
        return _promotion_popup_response(request, pk)

    def patch(self, request, pk) -> Response:
        popup = get_promotion_popup(pk)
        if popup is None:
            return not_found("promotion_popup_not_found", "Promotion popup not found.")
        serializer = AdminPromotionPopupWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            update_promotion_popup(popup=popup, data=serializer.validated_data)
        except DomainError as exc:
            return _promotion_popup_error(exc)
        return _promotion_popup_response(request, pk)

    def delete(self, request, pk) -> Response:
        popup = get_promotion_popup(pk)
        if popup is None:
            return not_found("promotion_popup_not_found", "Promotion popup not found.")
        delete_promotion_popup(popup=popup)
        return Response({"data": {}, "message": "Success"})


CONVERSION_PROVIDER_PARAMETER = OpenApiParameter(
    "provider",
    OpenApiTypes.STR,
    location=OpenApiParameter.PATH,
    enum=ConversionEvent.Provider.values,
    description="ga4, meta or tiktok.",
)


@extend_schema(tags=["Business Settings"])
class AdminConversionTrackingListView(APIView):
    """Server-side Purchase tracking: where each provider's settings come from
    and whether it is sending. Secrets are never returned."""

    serializer_class = AdminConversionProviderSerializer
    permission_classes: ClassVar[list] = [SettingsViewPermission]

    def get(self, request) -> Response:
        return Response(
            {
                "data": AdminConversionProviderSerializer(provider_states(), many=True).data,
                "message": "Success",
            }
        )


@extend_schema(tags=["Business Settings"], parameters=[CONVERSION_PROVIDER_PARAMETER])
class AdminConversionTrackingDetailView(APIView):
    """PATCH saves this shop's own credentials, which then take precedence over
    the server environment. `{"is_enabled": false}` switches the provider off.
    DELETE removes the saved settings and hands the provider back to the
    environment variables."""

    serializer_class = AdminConversionProviderSerializer
    permission_classes: ClassVar[list] = [SettingsManagePermission]

    @extend_schema(request=AdminConversionProviderUpdateSerializer)
    def patch(self, request, provider: str) -> Response:
        if provider not in ConversionEvent.Provider.values:
            return not_found("provider_not_found", "Provider not found.")
        serializer = AdminConversionProviderUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            state = save_provider_settings(
                provider=provider, data=dict(serializer.validated_data), actor=request.user
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": AdminConversionProviderSerializer(state).data, "message": "Success"}
        )

    def delete(self, request, provider: str) -> Response:
        if provider not in ConversionEvent.Provider.values:
            return not_found("provider_not_found", "Provider not found.")
        state = reset_provider_settings(provider=provider, actor=request.user)
        return Response(
            {"data": AdminConversionProviderSerializer(state).data, "message": "Success"}
        )


TEST_EMAIL_MESSAGES = {
    True: "The SMTP server accepted the test message. That does not confirm it reached the inbox.",
    False: "The SMTP server did not accept the test message.",
}


@extend_schema(tags=["Business Settings"])
class AdminEmailSettingsView(APIView):
    """Outgoing email. GET shows which server sends mail and its safe details,
    never the password. PATCH saves this shop's own SMTP server, which then
    takes precedence over the environment; `{"is_enabled": false}` hands mail
    back to the environment settings. DELETE forgets the saved server."""

    serializer_class = AdminEmailSettingsSerializer

    def get_permissions(self):
        if self.request.method == "GET":
            return [SettingsViewPermission()]
        return [SettingsManagePermission()]

    def get(self, request) -> Response:
        return Response(
            {"data": AdminEmailSettingsSerializer(email_state()).data, "message": "Success"}
        )

    @extend_schema(
        request=AdminEmailSettingsUpdateSerializer,
        examples=[
            OpenApiExample(
                "Save an SMTP server",
                value={
                    "host": "smtp.example.com",
                    "port": 587,
                    "security": "starttls",
                    "username": "mailer@example.com",
                    "password": "app-password",
                    "from_name": "Example Shop",
                    "from_email": "orders@example.com",
                },
                request_only=True,
            ),
        ],
    )
    def patch(self, request) -> Response:
        serializer = AdminEmailSettingsUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            state = save_smtp_settings(data=dict(serializer.validated_data), actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": AdminEmailSettingsSerializer(state).data, "message": "Success"})

    def delete(self, request) -> Response:
        state = reset_smtp_settings(actor=request.user)
        return Response({"data": AdminEmailSettingsSerializer(state).data, "message": "Success"})


@extend_schema(tags=["Business Settings"])
class AdminEmailTestView(APIView):
    """Send a marked test message through the server in force. `accepted`
    means the SMTP server took it, not that it reached the inbox; `reason` is
    a fixed code (auth_failed, connection_failed, timeout, tls_failed,
    recipient_refused, sender_refused, host_not_allowed, rejected)."""

    serializer_class = AdminEmailTestResultSerializer
    permission_classes: ClassVar[list] = [SettingsManagePermission]
    throttle_classes: ClassVar[list] = [EmailTestRateThrottle]

    @extend_schema(request=AdminEmailTestSerializer)
    def post(self, request) -> Response:
        serializer = AdminEmailTestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        recipient = serializer.validated_data.get("recipient") or request.user.email or ""
        try:
            result = send_test_email(recipient=recipient, actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {
                "data": AdminEmailTestResultSerializer(result).data,
                "message": TEST_EMAIL_MESSAGES[result["accepted"]],
            }
        )
