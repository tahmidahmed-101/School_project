from __future__ import annotations

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.selectors.options import (
    get_shop_option,
    missing_combination_count,
    option_suggestions,
    product_combinations,
    shop_options,
)
from apps.catalog.selectors.products import get_product_by_id
from apps.catalog.services.options import (
    create_shop_option,
    delete_shop_option,
    set_product_options,
    update_shop_option,
)
from apps.common.exception_handler import status_for_code
from apps.common.exceptions import DomainError
from apps.common.generics import GenericListAPIView
from apps.common.params import get_bool
from apps.common.responses import error_from_exception, not_found

from .permissions import CatalogPermissionMixin
from .serializers import (
    ProductOptionsWriteSerializer,
    ShopOptionSerializer,
    ShopOptionUpdateSerializer,
    ShopOptionWriteSerializer,
    serialize_options,
)


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


def _shop_option_response(option_id, *, status_code=status.HTTP_200_OK) -> Response:
    data = ShopOptionSerializer(get_shop_option(option_id)).data
    return Response({"data": data, "message": "Success"}, status=status_code)


@extend_schema(tags=["Catalog"])
class AdminOptionListCreateView(CatalogPermissionMixin, GenericListAPIView):
    """The shop options (Size, Colour, ...) a product form offers."""

    serializer_class = ShopOptionSerializer
    search_fields = ("name",)
    ordering_fields = ("name", "created_at")
    default_ordering = "name"

    def get_queryset(self):
        return shop_options(is_active=get_bool(self.request.query_params, "is_active"))

    def get(self, request) -> Response:
        return self.list_response(request)

    def post(self, request) -> Response:
        serializer = ShopOptionWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            option = create_shop_option(actor=request.user, **serializer.validated_data)
        except DomainError as exc:
            return error_from_exception(exc)
        return _shop_option_response(option.id, status_code=status.HTTP_201_CREATED)


@extend_schema(tags=["Catalog"])
class AdminOptionDetailView(CatalogPermissionMixin, APIView):
    serializer_class = ShopOptionSerializer

    def get(self, request, option_id) -> Response:
        if get_shop_option(option_id) is None:
            return not_found("option_not_found", "Option not found.")
        return _shop_option_response(option_id)

    def patch(self, request, option_id) -> Response:
        option = get_shop_option(option_id)
        if option is None:
            return not_found("option_not_found", "Option not found.")
        serializer = ShopOptionUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            update_shop_option(
                option=option, data=dict(serializer.validated_data), actor=request.user
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return _shop_option_response(option_id)

    def delete(self, request, option_id) -> Response:
        option = get_shop_option(option_id)
        if option is None:
            return not_found("option_not_found", "Option not found.")
        delete_shop_option(option=option, actor=request.user)
        return Response({"data": {}, "message": "Success"})
