from __future__ import annotations

from typing import ClassVar

from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import Category
from apps.catalog.selectors.categories import get_category_by_id
from apps.catalog.selectors.products import (
    get_product_by_id,
    get_variant_by_id,
    variants_for_product,
    variants_list,
)
from apps.catalog.services.products import (
    create_variant,
    delete_variant,
    update_variant,
)
from apps.catalog.services.variant_import_export import export_variants, import_variants
from apps.catalog.services.variants import bulk_update_variants, generate_variants
from apps.common.exception_handler import status_for_code
from apps.common.exceptions import DomainError
from apps.common.generics import (
    GenericListAPIView,
    filter_search,
)
from apps.common.pagination import DefaultPageNumberPagination
from apps.common.params import get_bool, get_choice, get_related
from apps.common.responses import error_from_exception, not_found
from apps.common.utils.export import CsvRenderer
from apps.common.utils.files import validate_upload_size
from apps.inventory.selectors.stock import (
    available_quantities_for_variants,
    reorder_points_for_variants,
)
from apps.orders.services.carts import get_preordered_quantities

from .permissions import (
    VARIANT_SEARCH_FIELDS,
    CatalogManagePermission,
    CatalogPermissionMixin,
    CatalogViewPermission,
)
from .serializers import (
    ProductVariantCreateSerializer,
    ProductVariantSerializer,
    ProductVariantUpdateSerializer,
    VariantBulkUpdateSerializer,
    VariantGenerateSerializer,
)


def _variant_rows(variants: list) -> list[dict]:
    variant_ids = [variant.id for variant in variants]
    context = {
        "stock_by_variant": available_quantities_for_variants(variant_ids),
        "reorder_point_by_variant": reorder_points_for_variants(variant_ids),
        "preordered_by_variant": get_preordered_quantities(variants),
    }
    return ProductVariantSerializer(variants, many=True, context=context).data


class AdminProductVariantListCreateView(CatalogPermissionMixin, APIView):

    serializer_class = ProductVariantSerializer
    pagination_class = DefaultPageNumberPagination

    def get(self, request, product_id) -> Response:
        product = get_product_by_id(product_id)
        if product is None:
            return not_found("product_not_found", "Product not found.")
        queryset = filter_search(variants_for_product(product), request, VARIANT_SEARCH_FIELDS)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        items = list(page if page is not None else queryset)
        # The paginator has already counted; a second COUNT(*) would repeat it.
        total_count = paginator.page.paginator.count if page is not None else len(items)
        variant_ids = [v.id for v in items]
        stock_by_variant = available_quantities_for_variants(variant_ids)
        reorder_point_by_variant = reorder_points_for_variants(variant_ids)
        preordered_by_variant = get_preordered_quantities(items)
        serializer = ProductVariantSerializer(
            items,
            many=True,
            context={
                "stock_by_variant": stock_by_variant,
                "reorder_point_by_variant": reorder_point_by_variant,
                "preordered_by_variant": preordered_by_variant,
            },
        )
        return Response(
            {
                "data": {
                    "results": serializer.data,
                    "count": total_count,
                    "next": paginator.get_next_link() if page is not None else None,
                    "previous": paginator.get_previous_link() if page is not None else None,
                },
                "message": "Success",
            }
        )

    def post(self, request, product_id) -> Response:
        product = get_product_by_id(product_id)
        if product is None:
            return not_found("product_not_found", "Product not found.")
        serializer = ProductVariantCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            variant = create_variant(
                product=product, actor=request.user, **serializer.validated_data
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": ProductVariantSerializer(variant).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Catalog"])
class AdminProductVariantGlobalListView(CatalogPermissionMixin, GenericListAPIView):
    serializer_class = ProductVariantSerializer
    search_fields = VARIANT_SEARCH_FIELDS
    product_code_field = "product__product_code"
    ordering_fields = ("sku", "price", "created_at")
    default_ordering = "sku"

    def get_queryset(self):
        params = self.request.query_params
        product = get_related(params, "product_id", get_product_by_id, "Product not found.")
        category = get_related(params, "category_id", get_category_by_id, "Category not found.")
        category_type = get_choice(params, "category_type", Category.CategoryType.values)
        is_active = get_bool(params, "is_active")
        preorder_only = bool(get_bool(params, "preorder_only", default=False))
        preorder_status = get_choice(params, "preorder_status", ("active", "inactive"))
        queryset = variants_list(
            product=product,
            category=category,
            category_type=category_type,
            is_active=is_active,
            preorder_only=preorder_only,
            preorder_status=preorder_status,
        )
        stock_status = get_choice(params, "stock_status", ("out", "low", "in"))
        if stock_status == "low":
            queryset = queryset.filter(
                product__category__category_type=Category.CategoryType.STOCK
            )
        if stock_status:
            variant_ids = list(queryset.values_list("id", flat=True))
            stock_by_variant = available_quantities_for_variants(variant_ids)
            reorder_point_by_variant = reorder_points_for_variants(variant_ids)
            matching_ids = [
                vid
                for vid in variant_ids
                if _matches_stock_status(
                    stock_by_variant.get(vid, 0), reorder_point_by_variant.get(vid, 0), stock_status
                )
            ]
            queryset = queryset.filter(id__in=matching_ids)
        return queryset

    def get(self, request) -> Response:
        return self.list_response(request)

    def list_response(self, request) -> Response:
        queryset = self.get_filtered_queryset(request)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        items = list(page if page is not None else queryset)
        # The paginator has already counted; a second COUNT(*) would repeat it.
        total_count = paginator.page.paginator.count if page is not None else len(items)
        variant_ids = [v.id for v in items]
        stock_by_variant = available_quantities_for_variants(variant_ids)
        reorder_point_by_variant = reorder_points_for_variants(variant_ids)
        preordered_by_variant = get_preordered_quantities(items)
        serializer = self.serializer_class(
            items,
            many=True,
            context={
                "stock_by_variant": stock_by_variant,
                "reorder_point_by_variant": reorder_point_by_variant,
                "preordered_by_variant": preordered_by_variant,
            },
        )
        return Response(
            {
                "data": {
                    "results": serializer.data,
                    "count": total_count,
                    "next": paginator.get_next_link() if page is not None else None,
                    "previous": paginator.get_previous_link() if page is not None else None,
                },
                "message": "Success",
            }
        )


@extend_schema(tags=["Catalog"])
class AdminProductVariantGenerateView(APIView):
    serializer_class = VariantGenerateSerializer
    permission_classes: ClassVar[list] = [CatalogManagePermission]

    def post(self, request, product_id) -> Response:
        product = get_product_by_id(product_id)
        if product is None:
            return not_found("product_not_found", "Product not found.")
        serializer = VariantGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            created = generate_variants(
                product=product, actor=request.user, **serializer.validated_data
            )
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response(
            {"data": {"created": _variant_rows(created)}, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Catalog"])
class AdminProductVariantBulkUpdateView(APIView):
    serializer_class = VariantBulkUpdateSerializer
    permission_classes: ClassVar[list] = [CatalogManagePermission]

    def post(self, request, product_id) -> Response:
        product = get_product_by_id(product_id)
        if product is None:
            return not_found("product_not_found", "Product not found.")
        serializer = VariantBulkUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        try:
            updated = bulk_update_variants(
                product=product,
                variant_ids=data.pop("variant_ids", None),
                data=data,
                actor=request.user,
            )
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response({"data": {"updated": _variant_rows(updated)}, "message": "Success"})


@extend_schema(tags=["Catalog"])
class AdminVariantExportView(APIView):
    permission_classes: ClassVar[list] = [CatalogViewPermission]
    renderer_classes: ClassVar[list] = [JSONRenderer, CsvRenderer]

    @extend_schema(request=None, responses={(200, "text/csv"): OpenApiTypes.BINARY})
    def get(self, request) -> Response:
        fmt = request.query_params.get("file_format", "csv")
        if fmt not in {"csv", "xlsx"}:
            return error_from_exception(
                DomainError("file_format must be 'csv' or 'xlsx'.", code="invalid_format")
            )
        params = request.query_params
        product = get_related(params, "product_id", get_product_by_id, "Product not found.")
        category = get_related(params, "category_id", get_category_by_id, "Category not found.")
        category_type = get_choice(params, "category_type", Category.CategoryType.values)
        queryset = variants_list(product=product, category=category, category_type=category_type)
        content = export_variants(
            filter_search(
                queryset,
                request,
                VARIANT_SEARCH_FIELDS,
                product_code_field="product__product_code",
            ),
            fmt=fmt,
            kind=category_type,
        )
        content_type = (
            "text/csv"
            if fmt == "csv"
            else ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        )
        response = HttpResponse(content, content_type=content_type)
        response["Content-Disposition"] = f'attachment; filename="variants.{fmt}"'
        return response


@extend_schema(tags=["Catalog"])
class AdminVariantImportView(APIView):
    permission_classes: ClassVar[list] = [CatalogManagePermission]
    parser_classes: ClassVar[list] = [MultiPartParser, FormParser]

    @extend_schema(request=None, responses=OpenApiTypes.OBJECT)
    def post(self, request) -> Response:
        fmt = request.query_params.get("file_format", "csv")
        if fmt not in {"csv", "xlsx"}:
            return error_from_exception(
                DomainError("file_format must be 'csv' or 'xlsx'.", code="invalid_format")
            )
        uploaded_file = request.FILES.get("file")
        if uploaded_file is None:
            return error_from_exception(DomainError("No file uploaded.", code="missing_file"))
        try:
            validate_upload_size(uploaded_file)
            result = import_variants(file=uploaded_file, fmt=fmt)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {
                "data": {
                    "created": result.created,
                    "updated": result.updated,
                    "errors": result.errors,
                },
                "message": "Success",
            }
        )


@extend_schema(tags=["Catalog"])
class AdminProductVariantDetailView(CatalogPermissionMixin, APIView):

    serializer_class = ProductVariantSerializer

    def get(self, request, variant_id) -> Response:
        variant = get_variant_by_id(variant_id)
        if variant is None:
            return not_found("variant_not_found", "Variant not found.")
        return Response({"data": ProductVariantSerializer(variant).data, "message": "Success"})

    def patch(self, request, variant_id) -> Response:
        variant = get_variant_by_id(variant_id)
        if variant is None:
            return not_found("variant_not_found", "Variant not found.")
        serializer = ProductVariantUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            variant = update_variant(
                variant=variant, data=dict(serializer.validated_data), actor=request.user
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": ProductVariantSerializer(variant).data, "message": "Success"})

    def delete(self, request, variant_id) -> Response:
        variant = get_variant_by_id(variant_id)
        if variant is None:
            return not_found("variant_not_found", "Variant not found.")
        try:
            delete_variant(variant=variant, actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response({"data": {}, "message": "Success"})


def _matches_stock_status(stock: int, reorder_point: int, stock_status: str) -> bool:
    if stock_status == "out":
        return stock <= 0
    if stock_status == "low":
        return 0 < stock <= reorder_point
    if stock_status == "in":
        return stock > reorder_point
    return True
