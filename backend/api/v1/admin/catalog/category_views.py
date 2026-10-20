from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import Category
from apps.catalog.selectors.categories import all_categories, get_category_by_id
from apps.catalog.services.categories import create_category, delete_category, update_category
from apps.common.exceptions import DomainError
from apps.common.generics import (
    GenericListAPIView,
    IncludeDeletedMixin,
    RestoreAPIView,
)
from apps.common.params import get_choice
from apps.common.responses import error_from_exception, not_found

from .permissions import (
    CatalogManagePermission,
    CatalogPermissionMixin,
)
from .serializers import (
    CategoryCreateSerializer,
    CategorySerializer,
    CategoryUpdateSerializer,
)


@extend_schema(tags=["Catalog"])
class AdminCategoryListCreateView(IncludeDeletedMixin, CatalogPermissionMixin, GenericListAPIView):
    serializer_class = CategorySerializer
    search_fields = ("name", "slug")
    ordering_fields = ("name", "created_at")
    default_ordering = "-created_at"
    include_deleted_permission = CatalogManagePermission

    def get_queryset(self):
        category_type = get_choice(
            self.request.query_params, "category_type", Category.CategoryType.values
        )
        return all_categories(include_deleted=self.include_deleted(), category_type=category_type)

    def get(self, request) -> Response:
        return self.list_response(request)

    def post(self, request) -> Response:
        serializer = CategoryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        parent = None
        parent_id = data.get("parent_id")
        if parent_id:
            parent = get_category_by_id(parent_id)
            if parent is None:
                return error_from_exception(
                    DomainError("Parent category not found.", code="parent_not_found")
                )
        try:
            category = create_category(
                name=data["name"],
                parent=parent,
                description=data.get("description", ""),
                category_type=data.get("category_type"),
                is_active=data.get("is_active", True),
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {
                "data": CategorySerializer(category, context={"request": request}).data,
                "message": "Success",
            },
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Catalog"])
class AdminCategoryDetailView(CatalogPermissionMixin, APIView):

    serializer_class = CategorySerializer

    def get(self, request, category_id) -> Response:
        category = get_category_by_id(category_id)
        if category is None:
            return not_found("category_not_found", "Category not found.")
        return Response(
            {
                "data": CategorySerializer(category, context={"request": request}).data,
                "message": "Success",
            }
        )

    def patch(self, request, category_id) -> Response:
        category = get_category_by_id(category_id)
        if category is None:
            return not_found("category_not_found", "Category not found.")
        serializer = CategoryUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        if "parent_id" in data:
            parent_id = data.pop("parent_id")
            parent = get_category_by_id(parent_id) if parent_id else None
            if parent_id and parent is None:
                return error_from_exception(
                    DomainError("Parent category not found.", code="parent_not_found")
                )
            data["parent"] = parent
        try:
            category = update_category(category=category, data=data)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {
                "data": CategorySerializer(category, context={"request": request}).data,
                "message": "Success",
            }
        )

    def delete(self, request, category_id) -> Response:
        category = get_category_by_id(category_id)
        if category is None:
            return not_found("category_not_found", "Category not found.")
        try:
            delete_category(category=category, actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": {}, "message": "Success"})


@extend_schema(tags=["Catalog"])
class AdminCategoryRestoreView(RestoreAPIView):
    permission_classes: ClassVar[list] = [CatalogManagePermission]
    get_object_fn = staticmethod(get_category_by_id)
    serializer_class = CategorySerializer
    not_found_code = "category_not_found"
    not_found_message = "Category not found."
