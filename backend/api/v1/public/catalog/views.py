from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import Category
from apps.catalog.selectors.bundles import (
    get_public_bundle_variant_by_slug,
    public_bundle_variants_list,
)
from apps.catalog.selectors.categories import (
    active_categories,
    get_category_by_id,
    get_category_by_slug,
)
from apps.catalog.selectors.products import (
    MAX_RELATED_PRODUCTS,
    RELATED_PRODUCTS_LIMIT,
    category_storefront_summaries,
    get_product_by_slug,
    products_list,
    related_products,
)
from apps.catalog.selectors.questions import published_questions_for_product
from apps.catalog.selectors.reviews import product_review_summary, reviews_for_product
from apps.common.generics import GenericListAPIView
from apps.common.params import get_bool, get_choice, get_int, get_related
from apps.common.responses import not_found
from apps.common.throttling import PublicReadRateThrottle

from .serializers import (
    PublicBundleSerializer,
    PublicCategorySerializer,
    PublicProductDetailSerializer,
    PublicProductListSerializer,
    PublicProductQuestionSerializer,
    PublicProductReviewSerializer,
    stock_context_for_products,
)


@extend_schema(tags=["Public Catalog"])
class PublicCategoryListView(APIView):
    serializer_class = PublicCategorySerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [PublicReadRateThrottle]

    def get(self, request) -> Response:
        category_type = get_choice(
            request.query_params, "category_type", Category.CategoryType.values
        )
        categories = active_categories(category_type=category_type)
        return Response(
            {
                "data": PublicCategorySerializer(
                    categories,
                    many=True,
                    context={"summaries": category_storefront_summaries()},
                ).data,
                "message": "Success",
            }
        )


@extend_schema(tags=["Public Catalog"])
class PublicCategoryDetailView(APIView):
    serializer_class = PublicCategorySerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [PublicReadRateThrottle]

    def get(self, request, slug) -> Response:
        category = get_category_by_slug(slug)
        if category is None:
            return not_found("category_not_found", "Category not found.")
        return Response(
            {
                "data": PublicCategorySerializer(
                    category, context={"summaries": category_storefront_summaries()}
                ).data,
                "message": "Success",
            }
        )


@extend_schema(tags=["Public Catalog"])
class PublicProductListView(GenericListAPIView):
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [PublicReadRateThrottle]
    serializer_class = PublicProductListSerializer
    search_fields = ("name",)
    ordering_fields = ("name", "created_at")
    default_ordering = "name"

    def get_queryset(self):
        params = self.request.query_params
        category = get_related(params, "category_id", get_category_by_id, "Category not found.")
        category_type = get_choice(params, "category_type", Category.CategoryType.values)
        preorder_only = bool(get_bool(params, "preorder_only", default=False))
        featured = get_bool(params, "featured", default=None)
        trending = get_bool(params, "trending", default=None)
        new_arrival = get_bool(params, "new_arrival", default=None)
        badge = params.get("badge") or None
        return products_list(
            category=category,
            category_type=category_type,
            is_active=True,
            sellable_only=True,
            preorder_only=preorder_only,
            featured=featured,
            trending=trending,
            new_arrival=new_arrival,
            badge=badge,
        )

    def get_serializer_context(self, items) -> dict:
        return stock_context_for_products(items)

    def get(self, request) -> Response:
        return self.list_response(request)


@extend_schema(tags=["Public Catalog"])
class PublicProductDetailView(APIView):
    serializer_class = PublicProductDetailSerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [PublicReadRateThrottle]

    def get(self, request, slug) -> Response:
        product = get_product_by_slug(slug)
        if product is None:
            return not_found("product_not_found", "Product not found.")
        return Response(
            {
                "data": PublicProductDetailSerializer(
                    product, context=stock_context_for_products([product])
                ).data,
                "message": "Success",
            }
        )


@extend_schema(tags=["Public Catalog"])
class PublicProductReviewListView(GenericListAPIView):
    serializer_class = PublicProductReviewSerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [PublicReadRateThrottle]
    ordering_fields = ("created_at",)
    default_ordering = "-created_at"

    def get_queryset(self):
        return reviews_for_product(self._product)

    def get(self, request, slug) -> Response:
        product = get_product_by_slug(slug)
        if product is None:
            return not_found("product_not_found", "Product not found.")
        self._product = product
        response = self.list_response(request)
        response.data["data"].update(product_review_summary(product))
        return response


@extend_schema(tags=["Public Catalog"])
class PublicProductQuestionListView(GenericListAPIView):
    """Answered, published questions only. Pending or unpublished ones are
    visible to their author via `/customer/questions/` and to staff."""

    serializer_class = PublicProductQuestionSerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [PublicReadRateThrottle]

    def get_queryset(self):
        return published_questions_for_product(self._product)

    def get(self, request, slug) -> Response:
        product = get_product_by_slug(slug)
        if product is None:
            return not_found("product_not_found", "Product not found.")
        self._product = product
        return self.list_response(request)


@extend_schema(
    tags=["Public Catalog"],
    parameters=[
        OpenApiParameter(
            "limit", int, description=f"1-{MAX_RELATED_PRODUCTS}, default {RELATED_PRODUCTS_LIMIT}."
        )
    ],
)
class PublicRelatedProductListView(APIView):
    """Related products for one product page. A fixed-size list, not paginated."""

    serializer_class = PublicProductListSerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [PublicReadRateThrottle]

    def get(self, request, slug) -> Response:
        limit = get_int(
            request.query_params,
            "limit",
            default=RELATED_PRODUCTS_LIMIT,
            min_value=1,
            max_value=MAX_RELATED_PRODUCTS,
        )
        product = get_product_by_slug(slug)
        if product is None:
            return not_found("product_not_found", "Product not found.")
        products = related_products(product, limit=limit)
        return Response(
            {
                "data": PublicProductListSerializer(
                    products, many=True, context=stock_context_for_products(products)
                ).data,
                "message": "Success",
            }
        )


@extend_schema(tags=["Public Catalog"])
class PublicBundleListView(GenericListAPIView):
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [PublicReadRateThrottle]
    serializer_class = PublicBundleSerializer
    search_fields = ("product__name",)
    ordering_fields = ("product__name", "created_at")
    default_ordering = "product__name"

    def get_queryset(self):
        return public_bundle_variants_list()

    def get(self, request) -> Response:
        return self.list_response(request)


@extend_schema(tags=["Public Catalog"])
class PublicBundleDetailView(APIView):
    serializer_class = PublicBundleSerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [PublicReadRateThrottle]

    def get(self, request, slug) -> Response:
        bundle = get_public_bundle_variant_by_slug(slug)
        if bundle is None:
            return not_found("variant_not_found", "Bundle not found.")
        return Response({"data": PublicBundleSerializer(bundle).data, "message": "Success"})
