from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.responses import not_found
from apps.common.throttling import TrackingRateThrottle
from apps.orders.selectors.sales_orders import _orders_with_related

from .serializers import PublicTrackOrderSerializer


@extend_schema(tags=["Public Tracking"])
class PublicTrackOrderView(APIView):
    serializer_class = PublicTrackOrderSerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [TrackingRateThrottle]

    def post(self, request) -> Response:
        order_number = request.data.get("order_number", "").strip()
        phone = request.data.get("phone", "").strip()

        if not order_number:
            return Response(
                {
                    "error": {
                        "code": "missing_order_number",
                        "message": "Order number is required.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not phone:
            return Response(
                {
                    "error": {
                        "code": "missing_phone",
                        "message": "Phone number is required.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        order = (
            _orders_with_related()
            .filter(order_number=order_number, deleted_at__isnull=True)
            .first()
        )

        if order is None:
            # Use same error for both invalid order and wrong phone to avoid leaking info
            return not_found("order_not_found", "Order not found or phone does not match.")

        # Verify phone matches either contact_phone or customer phone
        order_phone = (order.contact_phone or "").strip()
        customer_phone = (order.customer.phone or "").strip() if order.customer else ""
        shipping_phone = ""
        if order.shipping_address_snapshot:
            shipping_phone = (order.shipping_address_snapshot.get("phone") or "").strip()

        if not (
            order_phone == phone
            or customer_phone == phone
            or shipping_phone == phone
        ):
            return not_found("order_not_found", "Order not found or phone does not match.")

        return Response(
            {"data": PublicTrackOrderSerializer(order).data, "message": "Success"}
        )