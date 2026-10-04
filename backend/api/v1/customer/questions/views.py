from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.selectors.products import get_public_product_by_id
from apps.catalog.selectors.questions import questions_for_customer
from apps.catalog.services.questions import ask_question
from apps.common.exceptions import DomainError
from apps.common.generics import GenericListAPIView
from apps.common.permissions import IsCustomer
from apps.common.responses import error_from_exception, not_found
from apps.common.throttling import ProductQuestionRateThrottle

from .serializers import CustomerQuestionSerializer


@extend_schema(tags=["Product Questions"])
class CustomerQuestionListView(GenericListAPIView):
    """The customer's own questions, answered or not."""

    serializer_class = CustomerQuestionSerializer
    permission_classes: ClassVar[list] = [IsCustomer]
    ordering_fields = ("created_at",)
    default_ordering = "-created_at"

    def get_queryset(self):
        return questions_for_customer(self.request.user)

    def get(self, request) -> Response:
        return self.list_response(request)


@extend_schema(tags=["Product Questions"])
class CustomerQuestionCreateView(APIView):
    """Submitted questions stay private until staff answer and publish them."""

    serializer_class = CustomerQuestionSerializer
    permission_classes: ClassVar[list] = [IsCustomer]
    throttle_classes: ClassVar[list] = [ProductQuestionRateThrottle]

    def post(self, request, product_id) -> Response:
        product = get_public_product_by_id(product_id)
        if product is None:
            return not_found("product_not_found", "Product not found.")
        serializer = CustomerQuestionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            question = ask_question(
                customer=request.user,
                product=product,
                question=serializer.validated_data["question"],
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": CustomerQuestionSerializer(question).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )
