from __future__ import annotations

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.selectors.options import (
    missing_combination_count,
    option_suggestions,
    product_combinations,
)
from apps.catalog.selectors.products import get_product_by_id
from apps.catalog.services.options import set_product_options
from apps.common.exception_handler import status_for_code
from apps.common.exceptions import DomainError
from apps.common.responses import error_from_exception, not_found

from .permissions import CatalogPermissionMixin
from .serializers import ProductOptionsWriteSerializer, serialize_options


@extend_schema(tags=["Catalog"], responses=OpenApiTypes.OBJECT)
class AdminProductOptionsView(CatalogPermissionMixin, APIView):
    serializer_class = ProductOptionsWriteSerializer

    # PutToPatchMiddleware hands every PUT to `patch`.
    def patch(self, request, product_id) -> Response:
        product = get_product_by_id(product_id)
        if product is None:
            return not_found("product_not_found", "Product not found.")
        serializer = ProductOptionsWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            set_product_options(
                product=product, options=serializer.validated_data["options"], actor=request.user
            )
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        product = get_product_by_id(product_id)
        return Response(
            {
                "data": {
                    "options": serialize_options(product),
                    "missing_combinations": missing_combination_count(product),
                },
                "message": "Success",
            }
        )


@extend_schema(tags=["Catalog"], responses=OpenApiTypes.OBJECT)
class AdminProductCombinationsView(CatalogPermissionMixin, APIView):
    def get(self, request, product_id) -> Response:
        product = get_product_by_id(product_id)
        if product is None:
            return not_found("product_not_found", "Product not found.")
        combinations = [
            {
                "value_ids": [str(value_id) for value_id in row["value_ids"]],
                "title": row["title"],
                "variant_id": str(row["variant_id"]) if row["variant_id"] else None,
            }
            for row in product_combinations(product)
        ]
        return Response({"data": {"combinations": combinations}, "message": "Success"})


@extend_schema(tags=["Catalog"], responses=OpenApiTypes.OBJECT)
class AdminOptionSuggestionsView(CatalogPermissionMixin, APIView):
    def get(self, request) -> Response:
        suggestions = option_suggestions(name=request.query_params.get("name", ""))
        return Response({"data": suggestions, "message": "Success"})
