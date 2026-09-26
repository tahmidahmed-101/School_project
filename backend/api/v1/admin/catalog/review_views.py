from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.selectors.reviews import get_review_by_id
from apps.catalog.services.reviews import delete_review
from apps.common.responses import not_found

from .permissions import CatalogManagePermission


@extend_schema(tags=["Catalog"])
class AdminProductReviewDetailView(APIView):
    permission_classes: ClassVar[list] = [CatalogManagePermission]

    def delete(self, request, review_id) -> Response:
        review = get_review_by_id(review_id)
        if review is None:
            return not_found("review_not_found", "Review not found.")
        delete_review(review=review)
        return Response(status=status.HTTP_204_NO_CONTENT)
