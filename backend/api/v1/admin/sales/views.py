from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.admin.coupons.views import CouponsPermissionMixin
from apps.catalog.models import Sale
from apps.catalog.selectors.sales import get_sale_by_id, sales_list
from apps.catalog.services.sales import create_sale, delete_sale, update_sale
from apps.common.exceptions import DomainError
from apps.common.generics import GenericListAPIView
from apps.common.params import get_choice
from apps.common.responses import error_from_exception, not_found

from .serializers import SaleCreateSerializer, SaleSerializer, SaleUpdateSerializer


def _sale_response(sale_id, status_code: int = status.HTTP_200_OK) -> Response:
    # Re-read so the row carries the targets as saved, prefetched.
    sale = get_sale_by_id(sale_id)
    return Response({"data": SaleSerializer(sale).data, "message": "Success"}, status=status_code)


@extend_schema(tags=["Sales"])
class AdminSaleListCreateView(CouponsPermissionMixin, GenericListAPIView):
    """Promotions share the coupons' permissions. `status` filters by
    scheduled, running, ended or off."""

    serializer_class = SaleSerializer
    search_fields = ("name",)
    ordering_fields = ("name", "starts_at", "ends_at", "percent_off", "created_at")
    default_ordering = "-starts_at"

    def get_queryset(self):
        return sales_list(
            status=get_choice(self.request.query_params, "status", Sale.Status.values)
        )

    def get(self, request) -> Response:
        return self.list_response(request)

    def post(self, request) -> Response:
        serializer = SaleCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            sale = create_sale(**serializer.validated_data)
        except DomainError as exc:
            return error_from_exception(exc)
        return _sale_response(sale.id, status.HTTP_201_CREATED)


@extend_schema(tags=["Sales"])
class AdminSaleDetailView(CouponsPermissionMixin, APIView):
    serializer_class = SaleSerializer

    def get(self, request, sale_id) -> Response:
        sale = get_sale_by_id(sale_id)
        if sale is None:
            return not_found("sale_not_found", "Sale not found.")
        return Response({"data": SaleSerializer(sale).data, "message": "Success"})

    def patch(self, request, sale_id) -> Response:
        sale = get_sale_by_id(sale_id)
        if sale is None:
            return not_found("sale_not_found", "Sale not found.")
        serializer = SaleUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            update_sale(sale=sale, **serializer.validated_data)
        except DomainError as exc:
            return error_from_exception(exc)
        return _sale_response(sale.id)

    def delete(self, request, sale_id) -> Response:
        sale = get_sale_by_id(sale_id)
        if sale is None:
            return not_found("sale_not_found", "Sale not found.")
        delete_sale(sale=sale, actor=request.user)
        return Response({"data": {}, "message": "Success"})
