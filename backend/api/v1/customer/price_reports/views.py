from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.selectors.products import get_public_product_by_id, get_variant_by_id
from apps.catalog.services.price_reports import report_price_issue
from apps.common.exceptions import DomainError
from apps.common.permissions import IsCustomer
from apps.common.responses import error_from_exception, error_response, not_found
from apps.common.throttling import PriceReportRateThrottle

from .serializers import CustomerPriceReportSerializer


@extend_schema(tags=["Price Reports"])
class CustomerPriceReportCreateView(APIView):
    """Report a suspected wrong price. Reports are visible to staff only."""

    serializer_class = CustomerPriceReportSerializer
    permission_classes: ClassVar[list] = [IsCustomer]
    throttle_classes: ClassVar[list] = [PriceReportRateThrottle]

    def post(self, request, product_id) -> Response:
        product = get_public_product_by_id(product_id)
        if product is None:
            return not_found("product_not_found", "Product not found.")
        serializer = CustomerPriceReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        variant_id = data.pop("variant_id")
        variant = None
        if variant_id is not None:
            variant = get_variant_by_id(variant_id)
            if variant is None:
                return error_response(
                    "variant_not_found",
                    "Variant not found.",
                    fields={"variant_id": ["Variant not found."]},
                )
        try:
            report = report_price_issue(
                reporter=request.user, product=product, variant=variant, **data
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": CustomerPriceReportSerializer(report).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )
