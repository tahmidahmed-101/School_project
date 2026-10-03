from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from rest_framework import serializers

from apps.catalog.selectors.products import get_product_by_id
from apps.catalog.selectors.reviews import get_review_by_id, reviews_list
from apps.catalog.services.reviews import delete_review
from apps.common.generics import GenericListAPIView
from apps.common.params import get_choice, get_related
from apps.common.responses import not_found

from .permissions import CatalogManagePermission, CatalogPermissionMixin


class AdminProductReviewSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    product_id = serializers.UUIDField(read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    customer_id = serializers.UUIDField(read_only=True)
    customer_name = serializers.SerializerMethodField()
    rating = serializers.IntegerField(read_only=True)
    comment = serializers.CharField(read_only=True, allow_blank=True)
    is_verified_purchase = serializers.BooleanField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)

    def get_customer_name(self, obj) -> str:
        customer = obj.customer
        return customer.get_full_name().strip() or customer.email or customer.phone or "Customer"


@extend_schema(tags=["Catalog"])
class AdminProductReviewListView(CatalogPermissionMixin, GenericListAPIView):
    """Reviews across the catalog, for moderation. Filters: product_id, rating (1-5), search."""

    serializer_class = AdminProductReviewSerializer
    search_fields = ("comment", "product__name")
    ordering_fields = ("created_at", "rating")
    default_ordering = "-created_at"

    def get_queryset(self):
        params = self.request.query_params
        product = get_related(params, "product_id", get_product_by_id, "Product not found.")
        rating = get_choice(params, "rating", ("1", "2", "3", "4", "5"))
        return reviews_list(product=product, rating=int(rating) if rating else None)

    def get(self, request) -> Response:
        return self.list_response(request)


@extend_schema(tags=["Catalog"])
class AdminProductReviewDetailView(APIView):
    permission_classes: ClassVar[list] = [CatalogManagePermission]

    def delete(self, request, review_id) -> Response:
        review = get_review_by_id(review_id)
        if review is None:
            return not_found("review_not_found", "Review not found.")
        delete_review(review=review)
        return Response(status=status.HTTP_204_NO_CONTENT)
