from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import StaffPermissionCode
from apps.common.exception_handler import status_for_code
from apps.common.exceptions import DomainError
from apps.common.generics import GenericListAPIView, IncludeDeletedMixin, RestoreAPIView
from apps.common.permissions import require_any_staff_permission, require_staff_permission
from apps.common.responses import error_from_exception, not_found
from apps.orders.selectors.coupons import coupons_list, get_coupon_by_id
from apps.orders.services.coupons import create_coupon, delete_coupon, update_coupon

from .serializers import CouponCreateSerializer, CouponSerializer, CouponUpdateSerializer

CouponsViewPermission = require_any_staff_permission(
    StaffPermissionCode.ORDERS_VIEW, StaffPermissionCode.ORDERS_MANAGE
)
CouponsManagePermission = require_staff_permission(StaffPermissionCode.ORDERS_MANAGE)


class CouponsPermissionMixin:
    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [CouponsViewPermission()]
        return [CouponsManagePermission()]


@extend_schema(tags=["Coupons"])
class AdminCouponListCreateView(IncludeDeletedMixin, CouponsPermissionMixin, GenericListAPIView):
    serializer_class = CouponSerializer
    search_fields = ("code",)
    ordering_fields = ("code", "created_at", "expires_at")
    default_ordering = "-created_at"
    include_deleted_permission = CouponsManagePermission

    def get_queryset(self):
        return coupons_list(include_deleted=self.include_deleted())

    def get(self, request) -> Response:
        return self.list_response(request)

    def post(self, request) -> Response:
        serializer = CouponCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            coupon = create_coupon(**serializer.validated_data)
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response(
            {"data": CouponSerializer(get_coupon_by_id(coupon.id)).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Coupons"])
class AdminCouponDetailView(CouponsPermissionMixin, APIView):
    serializer_class = CouponSerializer

    def get(self, request, coupon_id) -> Response:
        coupon = get_coupon_by_id(coupon_id)
        if coupon is None:
            return not_found("coupon_not_found", "Coupon not found.")
        return Response({"data": CouponSerializer(coupon).data, "message": "Success"})

    def patch(self, request, coupon_id) -> Response:
        coupon = get_coupon_by_id(coupon_id)
        if coupon is None:
            return not_found("coupon_not_found", "Coupon not found.")
        serializer = CouponUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            update_coupon(coupon=coupon, **serializer.validated_data)
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response(
            {"data": CouponSerializer(get_coupon_by_id(coupon_id)).data, "message": "Success"}
        )

    def delete(self, request, coupon_id) -> Response:
        coupon = get_coupon_by_id(coupon_id)
        if coupon is None:
            return not_found("coupon_not_found", "Coupon not found.")
        try:
            delete_coupon(coupon=coupon, actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response({"data": {}, "message": "Success"})


@extend_schema(tags=["Coupons"])
class AdminCouponRestoreView(RestoreAPIView):
    permission_classes: ClassVar[list] = [CouponsManagePermission]
    get_object_fn = staticmethod(get_coupon_by_id)
    serializer_class = CouponSerializer
    not_found_code = "coupon_not_found"
    not_found_message = "Coupon not found."
