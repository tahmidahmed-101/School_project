from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.selectors.products import get_product_by_id
from apps.catalog.selectors.reviews import get_review_by_id
from apps.catalog.services.reviews import create_review, delete_review, update_review
from apps.common.exceptions import DomainError
from apps.common.permissions import IsCustomer
from apps.common.responses import error_from_exception, not_found

from .serializers import CustomerReviewSerializer, CustomerReviewUpdateSerializer


def _own_review_or_404(request, review_id):
    review = get_review_by_id(review_id)
    if review is None or review.customer_id != request.user.id:
        return None
    return review


@extend_schema(tags=["Reviews"])
class CustomerReviewCreateView(APIView):
    serializer_class = CustomerReviewSerializer
    permission_classes: ClassVar[list] = [IsCustomer]

    def post(self, request, product_id) -> Response:
        product = get_product_by_id(product_id)
        if product is None:
            return not_found("product_not_found", "Product not found.")
        serializer = CustomerReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            review = create_review(
                customer=request.user, product=product, **serializer.validated_data
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": CustomerReviewSerializer(review).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Reviews"])
class CustomerReviewDetailView(APIView):
    serializer_class = CustomerReviewSerializer
    permission_classes: ClassVar[list] = [IsCustomer]

    def patch(self, request, review_id) -> Response:
        review = _own_review_or_404(request, review_id)
        if review is None:
            return not_found("review_not_found", "Review not found.")
        serializer = CustomerReviewUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        review = update_review(review=review, **serializer.validated_data)
        return Response({"data": CustomerReviewSerializer(review).data, "message": "Success"})

    def delete(self, request, review_id) -> Response:
        review = _own_review_or_404(request, review_id)
        if review is None:
            return not_found("review_not_found", "Review not found.")
        delete_review(review=review)
        return Response(status=status.HTTP_204_NO_CONTENT)
