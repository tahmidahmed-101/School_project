from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.selectors.notifications import (
    get_notification_for_user,
    notifications_for_user,
    unread_notification_count,
)
from apps.accounts.services.notifications import (
    mark_all_notifications_read,
    mark_notification_read,
)
from apps.common.generics import GenericListAPIView
from apps.common.params import get_bool
from apps.common.permissions import IsCustomer
from apps.common.responses import not_found

from .serializers import NotificationSerializer


@extend_schema(
    tags=["Notifications"],
    parameters=[OpenApiParameter("unread", bool, description="Only unread notifications.")],
)
class NotificationListView(GenericListAPIView):
    """Newest first. `unread_count` rides along so a badge needs no second call."""

    serializer_class = NotificationSerializer
    permission_classes: ClassVar[list] = [IsCustomer]
    ordering_fields = ("created_at",)
    default_ordering = "-created_at"

    def get_queryset(self):
        unread_only = bool(get_bool(self.request.query_params, "unread", default=False))
        return notifications_for_user(self.request.user, unread_only=unread_only)

    def get(self, request) -> Response:
        response = self.list_response(request)
        response.data["data"]["unread_count"] = unread_notification_count(request.user)
        return response


@extend_schema(tags=["Notifications"])
class NotificationReadView(APIView):
    serializer_class = NotificationSerializer
    permission_classes: ClassVar[list] = [IsCustomer]

    def post(self, request, notification_id) -> Response:
        notification = get_notification_for_user(request.user, notification_id)
        if notification is None:
            return not_found("notification_not_found", "Notification not found.")
        notification = mark_notification_read(notification=notification)
        return Response({"data": NotificationSerializer(notification).data, "message": "Success"})


@extend_schema(tags=["Notifications"])
class NotificationReadAllView(APIView):
    permission_classes: ClassVar[list] = [IsCustomer]

    def post(self, request) -> Response:
        updated = mark_all_notifications_read(user=request.user)
        return Response({"data": {"updated": updated}, "message": "Success"})
