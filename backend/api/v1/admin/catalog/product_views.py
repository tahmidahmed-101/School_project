from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import Category
from apps.catalog.selectors.brands import get_brand_by_id
from apps.catalog.selectors.categories import get_category_by_id
from apps.catalog.selectors.products import (
    get_product_by_id,
    products_list,
)
from apps.catalog.services.products import (
    create_product,
    delete_product,
    restore_product,
    stage_product_status,
    update_product,
)
from apps.common.exceptions import DomainError
from apps.common.generics import (
    BulkActionMixin,
    GenericListAPIView,
    IncludeDeletedMixin,
    RestoreAPIView,
)
from apps.common.params import get_bool, get_choice, get_related
from apps.common.responses import error_from_exception, not_found
from apps.inventory.selectors.stock import (
    available_quantities_for_variants,
    reorder_points_for_variants,
)
from apps.orders.services.carts import get_preordered_quantities

from .permissions import (
    CatalogManagePermission,
    CatalogPermissionMixin,
)
from .serializers import (
    ProductBulkStatusSerializer,
    ProductCreateSerializer,
    ProductSerializer,
    ProductUpdateSerializer,
)


def _product_serializer_context(request, products) -> dict:
    # One batch query per lookup for every variant on the page; without these
    # keys ProductVariantSerializer falls back to a query per variant.
    variants = [v for product in products for v in product.active_variants]
    variant_ids = [v.id for v in variants]
    return {
        "request": request,
        "stock_by_variant": available_quantities_for_variants(variant_ids),
        "reorder_point_by_variant": reorder_points_for_variants(variant_ids),
        "preordered_by_variant": get_preordered_quantities(variants),
    }


def _resolve_brand(brand_id):
    """The Brand for an optional `brand_id` (None clears it). Raises DomainError if unknown."""
    if brand_id is None:
        return None
    brand = get_brand_by_id(brand_id)
    if brand is None:
        raise DomainError("Brand not found.", code="brand_not_found")
    return brand


class AdminProductListCreateView(IncludeDeletedMixin, CatalogPermissionMixin, GenericListAPIView):
    serializer_class = ProductSerializer
    search_fields = ("name",)
    ordering_fields = ("name", "created_at")
    default_ordering = "-created_at"
    include_deleted_permission = CatalogManagePermission

    def get_queryset(self):
        params = self.request.query_params
        category = get_related(params, "category_id", get_category_by_id, "Category not found.")
        category_type = get_choice(params, "category_type", Category.CategoryType.values)
        is_active = get_bool(params, "is_active")
        product_type = params.get("product_type", "").strip().lower() or None
        include_bundles = get_bool(params, "include_bundles", default=True)
        preorder_only = bool(get_bool(params, "preorder_only", default=False))
        preorder_status = get_choice(params, "preorder_status", ("active", "inactive"))
        return products_list(
            category=category,
            category_type=category_type,
            is_active=is_active,
            include_deleted=self.include_deleted(),
            include_bundles=include_bundles,
            product_type=product_type,
            preorder_only=preorder_only,
            preorder_active_only=False,
            preorder_status=preorder_status,
        )

    def get(self, request) -> Response:
        return self.list_response(request)

    def list_response(self, request) -> Response:
        queryset = self.get_filtered_queryset(request)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        items = list(page if page is not None else queryset)
        # The paginator has already counted; a second COUNT(*) would repeat it.
        total_count = paginator.page.paginator.count if page is not None else len(items)
        serializer = self.serializer_class(
            items, many=True, context=_product_serializer_context(request, items)
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

    def post(self, request) -> Response:
        serializer = ProductCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        category = get_category_by_id(data.pop("category_id"))
        if category is None:
            return error_from_exception(
                DomainError("Category not found.", code="category_not_found")
            )
        try:
            data["brand"] = _resolve_brand(data.pop("brand_id", None))
            product = create_product(category=category, actor=request.user, **data)
        except DomainError as exc:
            return error_from_exception(exc)
        # ProductSerializer reads the `active_variants` prefetch attribute, which only the
        # selector attaches — serializing the freshly built instance raises AttributeError.
        return Response(
            {
                "data": ProductSerializer(
                    get_product_by_id(product.id), context={"request": request}
                ).data,
                "message": "Success",
            },
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Catalog"])
class AdminProductDetailView(CatalogPermissionMixin, APIView):
    serializer_class = ProductSerializer

    def get(self, request, product_id) -> Response:
        product = get_product_by_id(product_id)
        if product is None:
            return not_found("product_not_found", "Product not found.")
        context = _product_serializer_context(request, [product])
        return Response(
            {
                "data": ProductSerializer(product, context=context).data,
                "message": "Success",
            }
        )

    def patch(self, request, product_id) -> Response:
        product = get_product_by_id(product_id)
        if product is None:
            return not_found("product_not_found", "Product not found.")
        serializer = ProductUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        if "category_id" in data:
            category = get_category_by_id(data.pop("category_id"))
            if category is None:
                return error_from_exception(
                    DomainError("Category not found.", code="category_not_found")
                )
            data["category"] = category
        if "brand_id" in data:
            try:
                data["brand"] = _resolve_brand(data.pop("brand_id"))
            except DomainError as exc:
                return error_from_exception(exc)
        product = update_product(product=product, data=data)
        return Response(
            {
                "data": ProductSerializer(product, context={"request": request}).data,
                "message": "Success",
            }
        )

    def delete(self, request, product_id) -> Response:
        product = get_product_by_id(product_id)
        if product is None:
            return not_found("product_not_found", "Product not found.")
        delete_product(product=product, actor=request.user)
        return Response({"data": {}, "message": "Success"})


@extend_schema(tags=["Catalog"])
class AdminProductRestoreView(RestoreAPIView):
    permission_classes: ClassVar[list] = [CatalogManagePermission]
    get_object_fn = staticmethod(get_product_by_id)
    restore_fn = staticmethod(restore_product)
    serializer_class = ProductSerializer
    not_found_code = "product_not_found"
    not_found_message = "Product not found."


@extend_schema(tags=["Catalog"])
class AdminProductBulkStatusView(BulkActionMixin, APIView):
    serializer_class = ProductBulkStatusSerializer
    permission_classes: ClassVar[list] = [CatalogManagePermission]

    def post(self, request) -> Response:
        serializer = ProductBulkStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        is_active = serializer.validated_data["is_active"]
        return self.bulk_action(
            request,
            queryset_fn=lambda: products_list(is_active=None),
            action_fn=lambda product: stage_product_status(product=product, is_active=is_active),
            update_fields=["is_active", "updated_at"],
        )
