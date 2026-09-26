from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import Category
from apps.catalog.selectors.brands import (
    brands_list,
    get_brand_by_id,
)
from apps.catalog.selectors.categories import get_category_by_id
from apps.catalog.services.brands import (
    create_brand,
    delete_brand,
    stage_brand_status,
    update_brand,
)
from apps.common.exceptions import DomainError
from apps.common.generics import (
    BulkActionMixin,
    GenericListAPIView,
    IncludeDeletedMixin,
    RestoreAPIView,
)
from apps.common.params import get_bool, get_related
from apps.common.responses import error_from_exception, not_found

from .permissions import (
    CatalogManagePermission,
    CatalogPermissionMixin,
)
from .serializers import (
    BrandBulkStatusSerializer,
    BrandCreateSerializer,
    BrandSerializer,
    BrandUpdateSerializer,
)


@extend_schema(tags=["Catalog"])
class AdminBrandListCreateView(IncludeDeletedMixin, CatalogPermissionMixin, GenericListAPIView):
    serializer_class = BrandSerializer
    search_fields = ("name",)
    ordering_fields = ("name", "created_at")
    default_ordering = "name"
    include_deleted_permission = CatalogManagePermission

    def get_queryset(self):
        params = self.request.query_params
        category = get_related(params, "category_id", get_category_by_id, "Category not found.")
        is_active = get_bool(params, "is_active")
        return brands_list(
            category=category,
            is_active=is_active,
            include_deleted=self.include_deleted(),
        )

    def post(self, request) -> Response:
        serializer = BrandCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        category_ids = data.pop("category_ids", [])
        try:
            brand = create_brand(actor=request.user, **data)
            if category_ids:
                cats = Category.objects.filter(id__in=category_ids, deleted_at__isnull=True)
                brand.categories.set(cats)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {
                "data": BrandSerializer(
                    get_brand_by_id(brand.id), context={"request": request}
                ).data,
                "message": "Success",
            },
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Catalog"])
class AdminBrandDetailView(CatalogPermissionMixin, APIView):
    serializer_class = BrandSerializer

    def get(self, request, brand_id) -> Response:
        brand = get_brand_by_id(brand_id)
        if brand is None:
            return not_found("brand_not_found", "Brand not found.")
        return Response(
            {
                "data": BrandSerializer(brand, context={"request": request}).data,
                "message": "Success",
            }
        )

    def patch(self, request, brand_id) -> Response:
        brand = get_brand_by_id(brand_id)
        if brand is None:
            return not_found("brand_not_found", "Brand not found.")
        serializer = BrandUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        category_ids = data.pop("category_ids", None)
        brand = update_brand(brand=brand, data=data)
        if category_ids is not None:
            cats = Category.objects.filter(id__in=category_ids, deleted_at__isnull=True)
            brand.categories.set(cats)
        return Response(
            {
                "data": BrandSerializer(brand, context={"request": request}).data,
                "message": "Success",
            }
        )

    def delete(self, request, brand_id) -> Response:
        brand = get_brand_by_id(brand_id)
        if brand is None:
            return not_found("brand_not_found", "Brand not found.")
        try:
            delete_brand(brand=brand, actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": {}, "message": "Success"})


@extend_schema(tags=["Catalog"])
class AdminBrandRestoreView(RestoreAPIView):
    permission_classes: ClassVar[list] = [CatalogManagePermission]
    get_object_fn = staticmethod(get_brand_by_id)
    serializer_class = BrandSerializer
    not_found_code = "brand_not_found"
    not_found_message = "Brand not found."


@extend_schema(tags=["Catalog"])
class AdminBrandBulkStatusView(BulkActionMixin, APIView):
    serializer_class = BrandBulkStatusSerializer
    permission_classes: ClassVar[list] = [CatalogManagePermission]

    def post(self, request) -> Response:
        serializer = BrandBulkStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        is_active = serializer.validated_data["is_active"]
        return self.bulk_action(
            request,
            queryset_fn=lambda: brands_list(is_active=None),
            action_fn=lambda brand: stage_brand_status(brand=brand, is_active=is_active),
            update_fields=["is_active", "updated_at"],
        )