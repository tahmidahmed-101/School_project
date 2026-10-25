from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.exception_handler import status_for_code
from apps.common.exceptions import DomainError
from apps.common.generics import GenericListAPIView
from apps.common.params import get_choice
from apps.common.responses import error_from_exception, not_found
from apps.common.throttling import EmailTestRateThrottle
from apps.marketing.models import CampaignDelivery, EmailCampaign, EmailSuppression
from apps.marketing.selectors.campaigns import (
    audience_summary,
    campaigns_list,
    deliveries_list,
    delivery_counts,
    get_campaign_by_id,
    get_suppression_by_id,
    suppressions_list,
)
from apps.marketing.services.campaigns import (
    add_suppression,
    cancel_campaign,
    create_campaign,
    delete_campaign,
    remove_suppression,
    schedule_campaign,
    send_campaign_test,
    sms_footer_length,
    unschedule_campaign,
    update_campaign,
)

from .serializers import (
    AdminAudienceSerializer,
    AdminCampaignDeliverySerializer,
    AdminCampaignScheduleSerializer,
    AdminCampaignSerializer,
    AdminCampaignTestResultSerializer,
    AdminCampaignTestSerializer,
    AdminCampaignWriteSerializer,
    AdminSuppressionSerializer,
    AdminSuppressionWriteSerializer,
)
from .views import MarketingManagePermission, MarketingViewPermission


class _ReadOpenWriteManaged:
    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [MarketingViewPermission()]
        return [MarketingManagePermission()]


def _campaign_response(campaign: EmailCampaign, *, status_code=status.HTTP_200_OK) -> Response:
    counts = delivery_counts([campaign.id])
    data = AdminCampaignSerializer(campaign, context={"delivery_counts": counts}).data
    return Response({"data": data, "message": "Success"}, status=status_code)


@extend_schema(tags=["Marketing"])
class AdminCampaignListView(_ReadOpenWriteManaged, GenericListAPIView):
    """Email and SMS campaigns. Filters: status, channel. POST creates a draft."""

    serializer_class = AdminCampaignSerializer
    search_fields = ("name", "subject")
    ordering_fields = ("created_at", "scheduled_at")
    default_ordering = "-created_at"

    def get_queryset(self):
        params = self.request.query_params
        return campaigns_list(
            status=get_choice(params, "status", EmailCampaign.Status.values),
            channel=get_choice(params, "channel", EmailCampaign.Channel.values),
        )

    def get_serializer_context(self, items: list) -> dict:
        return {"delivery_counts": delivery_counts(item.id for item in items)}

    def get(self, request) -> Response:
        return self.list_response(request)

    @extend_schema(request=AdminCampaignWriteSerializer)
    def post(self, request) -> Response:
        serializer = AdminCampaignWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            campaign = create_campaign(data=dict(serializer.validated_data), actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc)
        return _campaign_response(campaign, status_code=status.HTTP_201_CREATED)


@extend_schema(tags=["Marketing"])
class AdminCampaignDetailView(_ReadOpenWriteManaged, APIView):
    """PATCH and DELETE work on drafts only."""

    serializer_class = AdminCampaignSerializer

    def get(self, request, campaign_id) -> Response:
        campaign = get_campaign_by_id(campaign_id)
        if campaign is None:
            return not_found("campaign_not_found", "Campaign not found.")
        return _campaign_response(campaign)

    @extend_schema(request=AdminCampaignWriteSerializer)
    def patch(self, request, campaign_id) -> Response:
        campaign = get_campaign_by_id(campaign_id)
        if campaign is None:
            return not_found("campaign_not_found", "Campaign not found.")
        serializer = AdminCampaignWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            campaign = update_campaign(
                campaign=campaign, data=dict(serializer.validated_data), actor=request.user
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return _campaign_response(campaign)

    def delete(self, request, campaign_id) -> Response:
        campaign = get_campaign_by_id(campaign_id)
        if campaign is None:
            return not_found("campaign_not_found", "Campaign not found.")
        try:
            delete_campaign(campaign=campaign, actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["Marketing"])
class AdminCampaignActionView(APIView):
    """`schedule` (optional `send_at`), `unschedule` and `cancel`. Sending
    itself happens in `manage.py send_campaigns`, never in this request."""

    serializer_class = AdminCampaignSerializer
    permission_classes: ClassVar[list] = [MarketingManagePermission]
    action: str = ""

    @extend_schema(request=AdminCampaignScheduleSerializer)
    def post(self, request, campaign_id) -> Response:
        campaign = get_campaign_by_id(campaign_id)
        if campaign is None:
            return not_found("campaign_not_found", "Campaign not found.")
        try:
            if self.action == "schedule":
                serializer = AdminCampaignScheduleSerializer(data=request.data)
                serializer.is_valid(raise_exception=True)
                campaign = schedule_campaign(
                    campaign=campaign,
                    send_at=serializer.validated_data.get("send_at"),
                    actor=request.user,
                )
            elif self.action == "unschedule":
                campaign = unschedule_campaign(campaign=campaign, actor=request.user)
            else:
                campaign = cancel_campaign(campaign=campaign, actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc)
        return _campaign_response(campaign)


@extend_schema(tags=["Marketing"])
class AdminCampaignTestView(APIView):
    """Send one marked copy to yourself (or `recipient`). `accepted` means the
    mail server took it, not that it reached the inbox."""

    serializer_class = AdminCampaignTestResultSerializer
    permission_classes: ClassVar[list] = [MarketingManagePermission]
    throttle_classes: ClassVar[list] = [EmailTestRateThrottle]

    @extend_schema(request=AdminCampaignTestSerializer)
    def post(self, request, campaign_id) -> Response:
        campaign = get_campaign_by_id(campaign_id)
        if campaign is None:
            return not_found("campaign_not_found", "Campaign not found.")
        serializer = AdminCampaignTestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        is_sms = campaign.channel == EmailCampaign.Channel.SMS
        own = request.user.phone if is_sms else request.user.email
        recipient = serializer.validated_data.get("recipient") or own or ""
        try:
            result = send_campaign_test(campaign=campaign, recipient=recipient, actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": AdminCampaignTestResultSerializer(result).data, "message": "Success"}
        )


@extend_schema(tags=["Marketing"])
class AdminCampaignDeliveryListView(GenericListAPIView):
    """Each recipient's copy. Filter: status."""

    serializer_class = AdminCampaignDeliverySerializer
    permission_classes: ClassVar[list] = [MarketingViewPermission]
    search_fields = ("email", "phone")
    ordering_fields = ("created_at", "sent_at")
    default_ordering = "created_at"

    def get_queryset(self):
        campaign = get_campaign_by_id(self.kwargs["campaign_id"])
        if campaign is None:
            return CampaignDelivery.objects.none()
        return deliveries_list(
            campaign=campaign,
            status=get_choice(self.request.query_params, "status", CampaignDelivery.Status.values),
        )

    def get(self, request, campaign_id) -> Response:
        if get_campaign_by_id(campaign_id) is None:
            return not_found("campaign_not_found", "Campaign not found.")
        return self.list_response(request)


@extend_schema(tags=["Marketing"])
class AdminCampaignAudienceView(APIView):
    """Who the next campaign would reach."""

    serializer_class = AdminAudienceSerializer
    permission_classes: ClassVar[list] = [MarketingViewPermission]

    def get(self, request) -> Response:
        summary = {**audience_summary(), "sms_footer_length": sms_footer_length()}
        return Response({"data": AdminAudienceSerializer(summary).data, "message": "Success"})


@extend_schema(tags=["Marketing"])
class AdminSuppressionListView(_ReadOpenWriteManaged, GenericListAPIView):
    """Addresses no campaign is sent to. Filter: reason. POST blocks one."""

    serializer_class = AdminSuppressionSerializer
    search_fields = ("email",)
    ordering_fields = ("created_at", "email")
    default_ordering = "-created_at"

    def get_queryset(self):
        return suppressions_list(
            reason=get_choice(self.request.query_params, "reason", EmailSuppression.Reason.values)
        )

    def get(self, request) -> Response:
        return self.list_response(request)

    @extend_schema(request=AdminSuppressionWriteSerializer)
    def post(self, request) -> Response:
        serializer = AdminSuppressionWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            suppression = add_suppression(**serializer.validated_data, actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response(
            {"data": AdminSuppressionSerializer(suppression).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Marketing"])
class AdminSuppressionDetailView(APIView):
    permission_classes: ClassVar[list] = [MarketingManagePermission]

    def delete(self, request, suppression_id) -> Response:
        suppression = get_suppression_by_id(suppression_id)
        if suppression is None:
            return not_found("suppression_not_found", "Suppression not found.")
        remove_suppression(suppression=suppression, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)
