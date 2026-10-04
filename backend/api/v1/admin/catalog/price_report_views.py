from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import PriceIssueReport
from apps.catalog.selectors.price_reports import get_price_report_by_id, price_reports_list
from apps.catalog.selectors.products import get_product_by_id
from apps.catalog.services.price_reports import update_price_report
from apps.common.generics import GenericListAPIView
from apps.common.params import get_choice, get_related
from apps.common.responses import not_found
from apps.common.serializers import user_label

from .permissions import CatalogPermissionMixin


class AdminPriceReportSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    product_id = serializers.UUIDField(read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    variant_id = serializers.UUIDField(read_only=True, allow_null=True)
    variant_sku = serializers.SerializerMethodField()
    # The price the store was charging when the report was reviewed, so staff
    # can compare it against the reporter's expectation without a second lookup.
    current_price = serializers.SerializerMethodField()
    expected_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True, allow_null=True
    )
    comment = serializers.CharField(read_only=True)
    reporter_id = serializers.UUIDField(read_only=True)
    reporter_name = serializers.SerializerMethodField()
    status = serializers.CharField(read_only=True)
    staff_note = serializers.CharField(read_only=True)
    resolved_by_name = serializers.SerializerMethodField()
    resolved_at = serializers.DateTimeField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)

    def get_variant_sku(self, obj) -> str | None:
        return obj.variant.sku if obj.variant else None

    def get_current_price(self, obj) -> str | None:
        return str(obj.variant.effective_price) if obj.variant else None

    def get_reporter_name(self, obj) -> str:
        return user_label(obj.reporter, "Customer")

    def get_resolved_by_name(self, obj) -> str:
        return user_label(obj.resolved_by)


class AdminPriceReportUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=PriceIssueReport.Status.choices, required=False)
    staff_note = serializers.CharField(required=False, allow_blank=True, max_length=2000)


@extend_schema(tags=["Catalog"])
class AdminPriceReportListView(CatalogPermissionMixin, GenericListAPIView):
    """Customer price-issue reports. Filters: product_id, status, search."""

    serializer_class = AdminPriceReportSerializer
    search_fields = ("comment", "product__name", "variant__sku")
    ordering_fields = ("created_at", "status")
    default_ordering = "-created_at"

    def get_queryset(self):
        params = self.request.query_params
        product = get_related(params, "product_id", get_product_by_id, "Product not found.")
        return price_reports_list(
            product=product,
            status=get_choice(params, "status", PriceIssueReport.Status.values),
        )

    def get(self, request) -> Response:
        return self.list_response(request)


@extend_schema(tags=["Catalog"])
class AdminPriceReportDetailView(CatalogPermissionMixin, APIView):
    serializer_class = AdminPriceReportUpdateSerializer

    def get(self, request, report_id) -> Response:
        report = get_price_report_by_id(report_id)
        if report is None:
            return not_found("price_report_not_found", "Price report not found.")
        return Response({"data": AdminPriceReportSerializer(report).data, "message": "Success"})

    def patch(self, request, report_id) -> Response:
        report = get_price_report_by_id(report_id)
        if report is None:
            return not_found("price_report_not_found", "Price report not found.")
        serializer = AdminPriceReportUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        report = update_price_report(report=report, actor=request.user, **serializer.validated_data)
        return Response({"data": AdminPriceReportSerializer(report).data, "message": "Success"})
