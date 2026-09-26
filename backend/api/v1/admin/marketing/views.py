from __future__ import annotations

from typing import ClassVar

from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import StaffPermissionCode
from apps.common.generics import GenericListAPIView, apply_ordering, filter_search
from apps.common.params import get_bool
from apps.common.permissions import require_any_staff_permission, require_staff_permission
from apps.common.responses import not_found
from apps.common.utils.export import CsvRenderer, csv_response
from apps.marketing.models import NewsletterSubscriber
from apps.marketing.selectors.subscribers import get_subscriber_by_id, subscribers_list

from .serializers import (
    AdminNewsletterSubscriberSerializer,
    AdminNewsletterSubscriberWriteSerializer,
)

MarketingViewPermission = require_any_staff_permission(
    StaffPermissionCode.MARKETING_VIEW, StaffPermissionCode.MARKETING_MANAGE
)
MarketingManagePermission = require_staff_permission(StaffPermissionCode.MARKETING_MANAGE)

SEARCH_FIELDS = ("email",)
ORDERING_FIELDS = ("created_at", "email")
EXPORT_COLUMNS = ("email", "is_active", "created_at", "unsubscribed_at")


def _export_rows(queryset):
    for subscriber in queryset:
        yield [
            subscriber.email,
            subscriber.is_active,
            subscriber.created_at,
            subscriber.unsubscribed_at,
        ]


@extend_schema(tags=["Marketing"])
class AdminNewsletterSubscriberListView(GenericListAPIView):
    serializer_class = AdminNewsletterSubscriberSerializer
    permission_classes: ClassVar[list] = [MarketingViewPermission]
    search_fields = SEARCH_FIELDS
    ordering_fields = ORDERING_FIELDS
    default_ordering = "-created_at"

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [MarketingViewPermission()]
        return [MarketingManagePermission()]

    def get_queryset(self):
        is_active = get_bool(self.request.query_params, "is_active", default=None)
        return subscribers_list(is_active=is_active)

    def get(self, request) -> Response:
        return self.list_response(request)

    def post(self, request) -> Response:
        serializer = AdminNewsletterSubscriberWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        is_active = data.get("is_active", True)
        subscriber = NewsletterSubscriber.objects.create(
            email=data["email"],
            is_active=is_active,
            unsubscribed_at=None if is_active else timezone.now(),
        )
        return Response(
            {"data": AdminNewsletterSubscriberSerializer(subscriber).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Marketing"])
class AdminNewsletterSubscriberDetailView(APIView):
    permission_classes: ClassVar[list] = [MarketingManagePermission]

    def patch(self, request, subscriber_id) -> Response:
        subscriber = get_subscriber_by_id(subscriber_id)
        if subscriber is None:
            return not_found("subscriber_not_found", "Subscriber not found.")
        serializer = AdminNewsletterSubscriberWriteSerializer(
            data=request.data,
            partial=True,
            context={"subscriber_id": subscriber.id},
        )
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        if "email" in data:
            subscriber.email = data["email"]
        if "is_active" in data:
            subscriber.is_active = data["is_active"]
            subscriber.unsubscribed_at = None if subscriber.is_active else timezone.now()

        update_fields = [*data.keys(), "updated_at"]
        if "is_active" in data:
            update_fields.append("unsubscribed_at")
        subscriber.save(update_fields=update_fields)
        return Response(
            {"data": AdminNewsletterSubscriberSerializer(subscriber).data, "message": "Success"}
        )

    def delete(self, request, subscriber_id) -> Response:
        subscriber = get_subscriber_by_id(subscriber_id)
        if subscriber is None:
            return not_found("subscriber_not_found", "Subscriber not found.")
        subscriber.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["Marketing"])
class AdminNewsletterSubscriberExportView(APIView):
    permission_classes: ClassVar[list] = [MarketingViewPermission]
    renderer_classes: ClassVar[list] = [JSONRenderer, CsvRenderer]

    @extend_schema(request=None, responses={(200, "text/csv"): OpenApiTypes.BINARY})
    def get(self, request):
        queryset = filter_search(subscribers_list(), request, SEARCH_FIELDS)
        queryset = apply_ordering(
            queryset, request, ordering_fields=ORDERING_FIELDS, default_ordering="-created_at"
        )
        return csv_response("newsletter-subscribers.csv", EXPORT_COLUMNS, _export_rows(queryset))
