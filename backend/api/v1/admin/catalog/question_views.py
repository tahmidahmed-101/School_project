from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.selectors.products import get_product_by_id
from apps.catalog.selectors.questions import QUESTION_STATUSES, get_question_by_id, questions_list
from apps.catalog.services.questions import delete_question, moderate_question
from apps.common.exceptions import DomainError
from apps.common.generics import GenericListAPIView
from apps.common.params import get_choice, get_kind, get_related
from apps.common.responses import error_from_exception, not_found
from apps.common.serializers import user_label

from .permissions import CatalogPermissionMixin


class AdminProductQuestionSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    product_id = serializers.UUIDField(read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    customer_id = serializers.UUIDField(read_only=True)
    customer_name = serializers.SerializerMethodField()
    question = serializers.CharField(read_only=True)
    answer = serializers.CharField(read_only=True)
    is_published = serializers.BooleanField(read_only=True)
    answered_by_name = serializers.SerializerMethodField()
    answered_at = serializers.DateTimeField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)

    def get_customer_name(self, obj) -> str:
        return user_label(obj.customer, "Customer")

    def get_answered_by_name(self, obj) -> str:
        return user_label(obj.answered_by)


class AdminProductQuestionUpdateSerializer(serializers.Serializer):
    answer = serializers.CharField(required=False, allow_blank=True, max_length=5000)
    is_published = serializers.BooleanField(required=False)


@extend_schema(tags=["Catalog"])
class AdminProductQuestionListView(CatalogPermissionMixin, GenericListAPIView):
    """Questions across the catalog, for moderation. Filters: product_id,
    status (pending | answered | published), search."""

    serializer_class = AdminProductQuestionSerializer
    search_fields = ("question", "answer", "product__name")
    ordering_fields = ("created_at", "answered_at")
    default_ordering = "-created_at"

    def get_queryset(self):
        params = self.request.query_params
        product = get_related(params, "product_id", get_product_by_id, "Product not found.")
        return questions_list(
            product=product,
            status=get_choice(params, "status", QUESTION_STATUSES),
            kind=get_kind(params),
        )

    def get(self, request) -> Response:
        return self.list_response(request)


@extend_schema(tags=["Catalog"])
class AdminProductQuestionDetailView(CatalogPermissionMixin, APIView):
    serializer_class = AdminProductQuestionUpdateSerializer

    def patch(self, request, question_id) -> Response:
        question = get_question_by_id(question_id)
        if question is None:
            return not_found("question_not_found", "Question not found.")
        serializer = AdminProductQuestionUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            question = moderate_question(
                question=question, actor=request.user, **serializer.validated_data
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": AdminProductQuestionSerializer(question).data, "message": "Success"}
        )

    def delete(self, request, question_id) -> Response:
        question = get_question_by_id(question_id)
        if question is None:
            return not_found("question_not_found", "Question not found.")
        delete_question(question=question)
        return Response(status=status.HTTP_204_NO_CONTENT)
