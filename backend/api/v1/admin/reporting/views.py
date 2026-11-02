from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import StaffPermissionCode
from apps.common.params import get_kind
from apps.common.permissions import require_any_staff_permission
from apps.common.serializers import DateRangeSerializer
from apps.reporting.selectors.dashboards import (
    dashboard_data,
    low_stock_summary,
    sales_trend,
    stock_turnover,
)

from .serializers import (
    DashboardSerializer,
    LowStockItemSerializer,
    SalesTrendPointSerializer,
)

ReportsViewPermission = require_any_staff_permission(
    StaffPermissionCode.REPORTS_VIEW, StaffPermissionCode.ACCOUNTING_VIEW
)


@extend_schema(tags=["Reporting"])
class SalesTrendView(APIView):
    serializer_class = DateRangeSerializer
    permission_classes: ClassVar[list] = [ReportsViewPermission]

    def get(self, request) -> Response:
        serializer = DateRangeSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        trend = sales_trend(**serializer.validated_data, kind=get_kind(request.query_params))
        return Response(
            {"data": SalesTrendPointSerializer(trend, many=True).data, "message": "Success"}
        )


@extend_schema(tags=["Reporting"])
class StockTurnoverView(APIView):
    serializer_class = DateRangeSerializer
    permission_classes: ClassVar[list] = [ReportsViewPermission]

    def get(self, request) -> Response:
        serializer = DateRangeSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        turnover = stock_turnover(**serializer.validated_data, kind=get_kind(request.query_params))
        return Response({"data": {"turnover_ratio": turnover}, "message": "Success"})


@extend_schema(tags=["Reporting"])
class LowStockSummaryView(APIView):
    serializer_class = LowStockItemSerializer
    permission_classes: ClassVar[list] = [ReportsViewPermission]

    def get(self, request) -> Response:
        items = low_stock_summary(kind=get_kind(request.query_params))
        if request.query_params.get("count_only") in {"1", "true"}:
            return Response({"data": {"count": items.count()}, "message": "Success"})
        return Response(
            {"data": LowStockItemSerializer(items, many=True).data, "message": "Success"}
        )


@extend_schema(tags=["Reporting"])
class DashboardView(APIView):
    serializer_class = DateRangeSerializer
    permission_classes: ClassVar[list] = [ReportsViewPermission]

    def get(self, request) -> Response:
        serializer = DateRangeSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        payload = dashboard_data(**serializer.validated_data, kind=get_kind(request.query_params))
        return Response({"data": DashboardSerializer(payload).data, "message": "Success"})
