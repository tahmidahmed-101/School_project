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
from apps.common.params import get_kind, get_related
from apps.common.permissions import require_any_staff_permission, require_staff_permission
from apps.common.responses import error_from_exception, not_found
from apps.logistics.selectors.rates import (
    carriers_list,
    get_carrier_by_id,
    get_rate_by_id,
    get_zone_by_id,
    rates_list,
    zones_list,
)
from apps.logistics.services.rates import (
    create_carrier,
    create_rate,
    create_zone,
    delete_carrier,
    delete_rate,
    delete_zone,
    update_carrier,
    update_rate,
    update_zone,
)

from .serializers import (
    CarrierCreateSerializer,
    CarrierSerializer,
    CarrierUpdateSerializer,
    ShippingRateInputSerializer,
    ShippingRateSerializer,
    ShippingRateUpdateSerializer,
    ShippingZoneCreateSerializer,
    ShippingZoneSerializer,
    ShippingZoneUpdateSerializer,
)

LogisticsViewPermission = require_any_staff_permission(
    StaffPermissionCode.SHIPMENTS_VIEW, StaffPermissionCode.SHIPMENTS_UPDATE
)
LogisticsUpdatePermission = require_staff_permission(StaffPermissionCode.SHIPMENTS_UPDATE)


class LogisticsPermissionMixin:
    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [LogisticsViewPermission()]
        return [LogisticsUpdatePermission()]


@extend_schema(tags=["Logistics"])
class AdminCarrierListCreateView(IncludeDeletedMixin, LogisticsPermissionMixin, GenericListAPIView):
    serializer_class = CarrierSerializer
    search_fields = ("name",)
    ordering_fields = ("name",)
    default_ordering = "name"
    include_deleted_permission = LogisticsUpdatePermission

    def get_queryset(self):
        return carriers_list(include_deleted=self.include_deleted())

    def get(self, request) -> Response:
        return self.list_response(request)

    def post(self, request) -> Response:
        serializer = CarrierCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        carrier = create_carrier(**serializer.validated_data)
        return Response(
            {"data": CarrierSerializer(carrier).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Logistics"])
class AdminCarrierDetailView(LogisticsPermissionMixin, APIView):
    serializer_class = CarrierSerializer

    def get(self, request, carrier_id) -> Response:
        carrier = get_carrier_by_id(carrier_id)
        if carrier is None:
            return not_found("carrier_not_found", "Carrier not found.")
        return Response({"data": CarrierSerializer(carrier).data, "message": "Success"})

    def patch(self, request, carrier_id) -> Response:
        carrier = get_carrier_by_id(carrier_id)
        if carrier is None:
            return not_found("carrier_not_found", "Carrier not found.")
        serializer = CarrierUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        carrier = update_carrier(carrier=carrier, **serializer.validated_data)
        return Response({"data": CarrierSerializer(carrier).data, "message": "Success"})

    def delete(self, request, carrier_id) -> Response:
        carrier = get_carrier_by_id(carrier_id)
        if carrier is None:
            return not_found("carrier_not_found", "Carrier not found.")
        try:
            delete_carrier(carrier=carrier, actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response({"data": {}, "message": "Success"})


@extend_schema(tags=["Logistics"])
class AdminCarrierRestoreView(RestoreAPIView):
    permission_classes: ClassVar[list] = [LogisticsUpdatePermission]
    get_object_fn = staticmethod(get_carrier_by_id)
    serializer_class = CarrierSerializer
    not_found_code = "carrier_not_found"
    not_found_message = "Carrier not found."


@extend_schema(tags=["Logistics"])
class AdminShippingZoneListCreateView(
    IncludeDeletedMixin, LogisticsPermissionMixin, GenericListAPIView
):
    serializer_class = ShippingZoneSerializer
    search_fields = ("name",)
    ordering_fields = ("name",)
    default_ordering = "name"
    include_deleted_permission = LogisticsUpdatePermission

    def get_queryset(self):
        return zones_list(
            include_deleted=self.include_deleted(), kind=get_kind(self.request.query_params)
        )

    def get(self, request) -> Response:
        return self.list_response(request)

    def post(self, request) -> Response:
        serializer = ShippingZoneCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            zone = create_zone(**serializer.validated_data)
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response(
            {"data": ShippingZoneSerializer(zone).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Logistics"])
class AdminShippingZoneDetailView(LogisticsPermissionMixin, APIView):
    serializer_class = ShippingZoneSerializer

    def get(self, request, zone_id) -> Response:
        zone = get_zone_by_id(zone_id)
        if zone is None:
            return not_found("zone_not_found", "Shipping zone not found.")
        return Response({"data": ShippingZoneSerializer(zone).data, "message": "Success"})

    def patch(self, request, zone_id) -> Response:
        zone = get_zone_by_id(zone_id)
        if zone is None:
            return not_found("zone_not_found", "Shipping zone not found.")
        serializer = ShippingZoneUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            zone = update_zone(zone=zone, **serializer.validated_data)
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response({"data": ShippingZoneSerializer(zone).data, "message": "Success"})

    def delete(self, request, zone_id) -> Response:
        zone = get_zone_by_id(zone_id)
        if zone is None:
            return not_found("zone_not_found", "Shipping zone not found.")
        try:
            delete_zone(zone=zone, actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response({"data": {}, "message": "Success"})


@extend_schema(tags=["Logistics"])
class AdminShippingZoneRestoreView(RestoreAPIView):
    permission_classes: ClassVar[list] = [LogisticsUpdatePermission]
    get_object_fn = staticmethod(get_zone_by_id)
    serializer_class = ShippingZoneSerializer
    not_found_code = "zone_not_found"
    not_found_message = "Shipping zone not found."


@extend_schema(tags=["Logistics"])
class AdminShippingRateListView(LogisticsPermissionMixin, GenericListAPIView):
    serializer_class = ShippingRateSerializer
    ordering_fields = ("base_weight", "base_charge")
    default_ordering = "zone__name"

    def get_queryset(self):
        params = self.request.query_params
        zone = get_related(params, "zone_id", get_zone_by_id, "Shipping zone not found.")
        carrier = get_related(params, "carrier_id", get_carrier_by_id, "Carrier not found.")
        return rates_list(zone=zone, carrier=carrier, kind=get_kind(params))

    def get(self, request) -> Response:
        return self.list_response(request)


@extend_schema(tags=["Logistics"])
class AdminShippingRateDetailView(LogisticsPermissionMixin, APIView):
    serializer_class = ShippingRateSerializer

    def get(self, request, rate_id) -> Response:
        rate = get_rate_by_id(rate_id)
        if rate is None:
            return not_found("rate_not_found", "Shipping rate not found.")
        return Response({"data": ShippingRateSerializer(rate).data, "message": "Success"})

    def patch(self, request, rate_id) -> Response:
        rate = get_rate_by_id(rate_id)
        if rate is None:
            return not_found("rate_not_found", "Shipping rate not found.")
        serializer = ShippingRateUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            rate = update_rate(rate=rate, **serializer.validated_data)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": ShippingRateSerializer(rate).data, "message": "Success"})

    def delete(self, request, rate_id) -> Response:
        rate = get_rate_by_id(rate_id)
        if rate is None:
            return not_found("rate_not_found", "Shipping rate not found.")
        delete_rate(rate=rate)
        return Response({"data": {}, "message": "Success"})


@extend_schema(tags=["Logistics"])
class AdminShippingZoneRateCreateView(APIView):
    serializer_class = ShippingRateInputSerializer
    permission_classes: ClassVar[list] = [LogisticsUpdatePermission]

    def post(self, request, zone_id) -> Response:
        zone = get_zone_by_id(zone_id)
        if zone is None:
            return not_found("zone_not_found", "Shipping zone not found.")
        serializer = ShippingRateInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        carrier = get_carrier_by_id(data.pop("carrier_id"))
        if carrier is None:
            return error_from_exception(DomainError("Carrier not found.", code="carrier_not_found"))

        try:
            create_rate(zone=zone, carrier=carrier, **data)
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        zone.refresh_from_db()
        return Response(
            {"data": ShippingZoneSerializer(zone).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )
