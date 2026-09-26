from __future__ import annotations

from typing import ClassVar

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.selectors.audit_logs import (
    all_audit_logs,
    all_login_history,
    get_audit_log_by_id,
)
from apps.audit.services.exports import EXPORT_COLUMNS, export_audit_logs
from apps.common.generics import GenericListAPIView, apply_ordering, filter_search
from apps.common.permissions import IsAdmin
from apps.common.responses import not_found
from apps.common.utils.export import CsvRenderer, csv_response

from .serializers import AuditLogSerializer, LoginHistorySerializer

AUDIT_SEARCH_FIELDS = ("action", "target_type", "actor__email")
AUDIT_ORDERING_FIELDS = ("created_at", "action")


@extend_schema(tags=["Audit"])
class AuditLogListView(GenericListAPIView):
    """Read-only, paginated/searchable/sortable audit log listing.

    Demonstrates `apps.common.generics.GenericListAPIView`: any new resource
    can get search + ordering + pagination by setting these four attributes
    and calling `self.list_response(request)`.
    """

    permission_classes: ClassVar[list] = [IsAdmin]
    serializer_class = AuditLogSerializer
    queryset_fn = staticmethod(all_audit_logs)
    search_fields = AUDIT_SEARCH_FIELDS
    ordering_fields = AUDIT_ORDERING_FIELDS
    default_ordering = "-created_at"

    def get(self, request):
        return self.list_response(request)


@extend_schema(tags=["Audit"])
class AuditLogDetailView(APIView):
    serializer_class = AuditLogSerializer
    permission_classes: ClassVar[list] = [IsAdmin]

    def get(self, request, log_id) -> Response:
        log = get_audit_log_by_id(log_id)
        if log is None:
            return not_found("audit_log_not_found", "Audit log not found.")
        return Response({"data": AuditLogSerializer(log).data, "message": "Success"})


@extend_schema(tags=["Audit"])
class AuditLogExportView(APIView):
    permission_classes: ClassVar[list] = [IsAdmin]
    renderer_classes: ClassVar[list] = [JSONRenderer, CsvRenderer]

    @extend_schema(request=None, responses={(200, "text/csv"): OpenApiTypes.BINARY})
    def get(self, request):
        queryset = filter_search(all_audit_logs(), request, AUDIT_SEARCH_FIELDS)
        queryset = apply_ordering(
            queryset,
            request,
            ordering_fields=AUDIT_ORDERING_FIELDS,
            default_ordering="-created_at",
        )
        return csv_response("audit-logs.csv", EXPORT_COLUMNS, export_audit_logs(queryset))


@extend_schema(tags=["Audit"])
class LoginHistoryListView(GenericListAPIView):
    """Read-only login attempt history (successes and failures)."""

    permission_classes: ClassVar[list] = [IsAdmin]
    serializer_class = LoginHistorySerializer
    queryset_fn = staticmethod(all_login_history)
    search_fields = ("email", "user__email", "ip_address")
    ordering_fields = ("created_at",)
    default_ordering = "-created_at"

    def get(self, request):
        return self.list_response(request)
