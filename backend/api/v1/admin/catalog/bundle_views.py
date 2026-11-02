from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import StaffPermissionCode
from apps.catalog.selectors.bundles import (
    bundle_available_quantities,
    bundle_variants_list,
    get_bundle_variant_by_id,
)
from apps.catalog.selectors.categories import get_category_by_id
from apps.catalog.services.bundles import create_bundle, delete_bundle, update_bundle
from apps.common.exceptions import DomainError
from apps.common.generics import GenericListAPIView, IncludeDeletedMixin, RestoreAPIView
from apps.common.permissions import require_staff_permission
from apps.common.responses import error_from_exception, not_found
from apps.inventory.selectors.stock import available_quantities_for_variants

from .bundle_serializers import (
    BundleCreateSerializer,
    BundleSerializer,
    BundleUpdateSerializer,
)
from .permissions import CatalogPermissionMixin

CatalogManagePermission = require_staff_permission(StaffPermissionCode.CATALOG_MANAGE)


def _bundle_context(items) -> dict:
    component_variant_ids = {
        item.component_variant_id for variant in items for item in variant.bundle_components.all()
    }
    return {
        "stock_by_variant": available_quantities_for_variants(component_variant_ids),
        "available_by_variant": bundle_available_quantities(v.id for v in items),
    }


@extend_schema(tags=["Catalog"])
class AdminBundleListCreateView(IncludeDeletedMixin, CatalogPermissionMixin, GenericListAPIView):
    serializer_class = BundleSerializer
    search_fields = ("sku", "product__name")
    product_code_field = "product__product_code"
    ordering_fields = ("sku", "price", "created_at")
    default_ordering = "-created_at"
    include_deleted_permission = CatalogManagePermission

    def get_queryset(self):
        return bundle_variants_list(include_deleted=self.include_deleted())

    def get(self, request) -> Response:
        return self.list_response(request)

    def post(self, request) -> Response:
        serializer = BundleCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        category = get_category_by_id(data.pop("category_id"))
        if category is None:
            return error_from_exception(
                DomainError("Category not found.", code="category_not_found")
            )
        components = data.pop("components")
        try:
            variant = create_bundle(
                category=category, components=components, actor=request.user, **data
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {
                "data": BundleSerializer(variant, context=_bundle_context([variant])).data,
                "message": "Success",
            },
            status=status.HTTP_201_CREATED,
        )

    def list_response(self, request) -> Response:
        queryset = self.get_filtered_queryset(request)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        items = list(page if page is not None else queryset)
        # The paginator has already counted; a second COUNT(*) would repeat it.
        total_count = paginator.page.paginator.count if page is not None else len(items)
        serializer = BundleSerializer(items, many=True, context=_bundle_context(items))
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


@extend_schema(tags=["Catalog"])
class AdminBundleDetailView(CatalogPermissionMixin, APIView):
    serializer_class = BundleSerializer

    def get(self, request, variant_id) -> Response:
        variant = get_bundle_variant_by_id(variant_id)
        if variant is None:
            return not_found("bundle_not_found", "Bundle not found.")
        return Response(
            {
                "data": BundleSerializer(variant, context=_bundle_context([variant])).data,
                "message": "Success",
            }
        )

    def patch(self, request, variant_id) -> Response:
        variant = get_bundle_variant_by_id(variant_id)
        if variant is None:
            return not_found("bundle_not_found", "Bundle not found.")
        serializer = BundleUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        components = data.pop("components", None)
        if "category_id" in data:
            category = get_category_by_id(data.pop("category_id"))
            if category is None:
                return error_from_exception(
                    DomainError("Category not found.", code="category_not_found")
                )
            data["category"] = category
        try:
            variant = update_bundle(
                bundle_variant=variant, data=data, components=components, actor=request.user
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {
                "data": BundleSerializer(variant, context=_bundle_context([variant])).data,
                "message": "Success",
            }
        )

    def delete(self, request, variant_id) -> Response:
        variant = get_bundle_variant_by_id(variant_id)
        if variant is None:
            return not_found("bundle_not_found", "Bundle not found.")
        try:
            delete_bundle(bundle_variant=variant, actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": {}, "message": "Success"})


@extend_schema(tags=["Catalog"])
class AdminBundleRestoreView(RestoreAPIView):
    permission_classes: ClassVar[list] = [CatalogManagePermission]
    get_object_fn = staticmethod(get_bundle_variant_by_id)
    serializer_class = BundleSerializer
    not_found_code = "bundle_not_found"
    not_found_message = "Bundle not found."
