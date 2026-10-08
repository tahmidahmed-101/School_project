from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import StaffPermissionCode
from apps.common.exceptions import DomainError
from apps.common.generics import GenericListAPIView
from apps.common.params import get_kind, get_search
from apps.common.permissions import require_any_staff_permission, require_staff_permission
from apps.common.responses import error_from_exception, not_found
from apps.orders.selectors.sales_orders import get_order_by_id
from apps.risk.selectors.fraud_cases import fraud_cases_list, get_fraud_case_by_id
from apps.risk.services import blocklist, ip_blocklist
from apps.risk.services.fraud_cases import resolve_fraud_case
from apps.risk.services.scoring import assess_order_risk

from .serializers import (
    BlockPhoneSerializer,
    FraudCaseSerializer,
    IPBlockSerializer,
    LiftPhoneBlockSerializer,
    PhoneBlockSerializer,
    ResolveFraudCaseSerializer,
    RiskAssessmentSerializer,
    UnblockIPSerializer,
)

RiskViewPermission = require_any_staff_permission(
    StaffPermissionCode.RISK_VIEW, StaffPermissionCode.RISK_MANAGE
)
RiskManagePermission = require_staff_permission(StaffPermissionCode.RISK_MANAGE)


class RiskPermissionMixin:
    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [RiskViewPermission()]
        return [RiskManagePermission()]


@extend_schema(tags=["Fraud & Risk"])
class AdminOrderRiskAssessView(APIView):
    serializer_class = RiskAssessmentSerializer
    permission_classes: ClassVar[list] = [RiskManagePermission]

    def post(self, request, order_id) -> Response:
        order = get_order_by_id(order_id)
        if order is None:
            return not_found("order_not_found", "Order not found.")
        assessment = assess_order_risk(order=order)
        return Response(
            {"data": RiskAssessmentSerializer(assessment).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Fraud & Risk"])
class AdminFraudCaseListView(RiskPermissionMixin, GenericListAPIView):
    serializer_class = FraudCaseSerializer
    ordering_fields = ("created_at", "status")
    default_ordering = "-created_at"

    def get_queryset(self):
        params = self.request.query_params
        # ?search= matches case/order number, customer or order email
        # (case-insensitive) and the order's, address's or customer's phone.
        return fraud_cases_list(
            status=params.get("status"), search=get_search(params), kind=get_kind(params)
        )

    def get(self, request) -> Response:
        return self.list_response(request)


@extend_schema(tags=["Fraud & Risk"])
class AdminFraudCaseDetailView(RiskPermissionMixin, APIView):
    serializer_class = FraudCaseSerializer

    def get(self, request, case_id) -> Response:
        case = get_fraud_case_by_id(case_id)
        if case is None:
            return not_found("fraud_case_not_found", "Fraud case not found.")
        return Response({"data": FraudCaseSerializer(case).data, "message": "Success"})


@extend_schema(tags=["Fraud & Risk"])
class AdminFraudCaseResolveView(APIView):
    serializer_class = ResolveFraudCaseSerializer
    permission_classes: ClassVar[list] = [RiskManagePermission]

    def patch(self, request, case_id) -> Response:
        case = get_fraud_case_by_id(case_id)
        if case is None:
            return not_found("fraud_case_not_found", "Fraud case not found.")
        serializer = ResolveFraudCaseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        case = resolve_fraud_case(
            case=case, resolution=data["resolution"], notes=data["resolution_notes"]
        )
        return Response({"data": FraudCaseSerializer(case).data, "message": "Success"})


@extend_schema(tags=["Fraud & Risk"])
class AdminIPBlocklistView(RiskPermissionMixin, APIView):
    serializer_class = IPBlockSerializer

    def get(self, request) -> Response:
        rows = ip_blocklist.blocks_list()
        return Response(
            {"data": IPBlockSerializer(rows, many=True).data, "message": "Success"}
        )

    def post(self, request) -> Response:
        serializer = IPBlockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            block = ip_blocklist.block_ip(
                data["ip_address"],
                reason=data["reason"],
                staff=request.user,
                expires_at=data.get("expires_at"),
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": IPBlockSerializer(block).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )

    def delete(self, request) -> Response:
        serializer = UnblockIPSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            ip_blocklist.unblock_ip(serializer.validated_data["ip_address"])
        except DomainError as exc:
            return error_from_exception(exc, status_code=status.HTTP_404_NOT_FOUND)
        return Response({"data": {}, "message": "Success"})


@extend_schema(tags=["Fraud & Risk"])
class AdminPhoneBlocklistView(RiskPermissionMixin, APIView):
    serializer_class = PhoneBlockSerializer

    def get(self, request) -> Response:
        include_lifted = request.query_params.get("include_lifted") == "true"
        rows = blocklist.blocks_list(include_lifted=include_lifted)
        return Response(
            {"data": PhoneBlockSerializer(rows, many=True).data, "message": "Success"}
        )

    def post(self, request) -> Response:
        serializer = BlockPhoneSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            block = blocklist.block_phone(
                data["phone_number"],
                reason=data["reason"],
                strength=data["strength"],
                staff=request.user,
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": PhoneBlockSerializer(block).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Fraud & Risk"])
class AdminPhoneBlockLiftView(APIView):
    serializer_class = LiftPhoneBlockSerializer
    permission_classes: ClassVar[list] = [RiskManagePermission]

    def post(self, request, phone_number) -> Response:
        serializer = LiftPhoneBlockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            block = blocklist.lift_block(
                phone_number, reason=serializer.validated_data["reason"], staff=request.user
            )
        except DomainError as exc:
            return error_from_exception(exc, status_code=status.HTTP_404_NOT_FOUND)
        return Response({"data": PhoneBlockSerializer(block).data, "message": "Success"})
