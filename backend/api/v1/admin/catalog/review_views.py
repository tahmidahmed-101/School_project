from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import ProductReview
from apps.catalog.selectors.products import get_product_by_id
from apps.catalog.selectors.reviews import get_review_by_id, reviews_list
from apps.catalog.services.reviews import MODERATION_STATUSES, delete_review, moderate_review
from apps.common.exceptions import DomainError
from apps.common.generics import GenericListAPIView
from apps.common.params import get_choice, get_kind, get_related
from apps.common.responses import error_from_exception, not_found
from apps.common.serializers import user_label

from .permissions import CatalogManagePermission, CatalogPermissionMixin


class AdminProductReviewSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    product_id = serializers.UUIDField(read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    customer_id = serializers.UUIDField(read_only=True)
    customer_name = serializers.SerializerMethodField()
    rating = serializers.IntegerField(read_only=True)
    comment = serializers.CharField(read_only=True, allow_blank=True)
    images = serializers.SerializerMethodField()
    is_verified_purchase = serializers.BooleanField(read_only=True)
    status = serializers.CharField(read_only=True)
    moderation_note = serializers.CharField(read_only=True, allow_blank=True)
    moderated_at = serializers.DateTimeField(read_only=True, allow_null=True)
    moderated_by_id = serializers.UUIDField(read_only=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)

    def get_customer_name(self, obj) -> str:
        return user_label(obj.customer, "Customer")

    def get_images(self, obj) -> list[str]:
        # `.all()` reads the list `reviews_list` prefetches.
        request = self.context.get("request")
        urls = [item.image.url for item in obj.images.all()]
        return [request.build_absolute_uri(url) for url in urls] if request else urls


@extend_schema(tags=["Catalog"])
class AdminProductReviewListView(CatalogPermissionMixin, GenericListAPIView):
    """Reviews across the catalog, for moderation. Filters: product_id, rating (1-5),
    status (pending / published / hidden), search."""

    serializer_class = AdminProductReviewSerializer
    search_fields = ("comment", "product__name")
    ordering_fields = ("created_at", "rating")
    default_ordering = "-created_at"

    def get_queryset(self):
        params = self.request.query_params
        product = get_related(params, "product_id", get_product_by_id, "Product not found.")
        rating = get_choice(params, "rating", ("1", "2", "3", "4", "5"))
        return reviews_list(
            product=product,
            rating=int(rating) if rating else None,
            kind=get_kind(params),
            status=get_choice(params, "status", ProductReview.Status.values),
        )

    def get(self, request) -> Response:
        return self.list_response(request)


class AdminProductReviewModerationSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=MODERATION_STATUSES)
    note = serializers.CharField(required=False, allow_blank=True, max_length=255, default="")


@extend_schema(tags=["Catalog"])
class AdminProductReviewDetailView(APIView):
    serializer_class = AdminProductReviewSerializer
    permission_classes: ClassVar[list] = [CatalogManagePermission]

    @extend_schema(request=AdminProductReviewModerationSerializer)
    def patch(self, request, review_id) -> Response:
        """Publish a review, or hide it from the storefront (`status`, optional `note`)."""
        review = get_review_by_id(review_id)
        if review is None:
            return not_found("review_not_found", "Review not found.")
        serializer = AdminProductReviewModerationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            review = moderate_review(
                review=review,
                status=serializer.validated_data["status"],
                note=serializer.validated_data["note"],
                actor=request.user,
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {
                "data": AdminProductReviewSerializer(review, context={"request": request}).data,
                "message": "Success",
            }
        )

    def delete(self, request, review_id) -> Response:
        review = get_review_by_id(review_id)
        if review is None:
            return not_found("review_not_found", "Review not found.")
        delete_review(review=review)
        return Response(status=status.HTTP_204_NO_CONTENT)
