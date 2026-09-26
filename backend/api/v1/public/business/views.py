from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.business.selectors import get_business_profile
from apps.common.throttling import PublicReadRateThrottle
from apps.orders.selectors.payment_methods import payment_methods_list

from .serializers import PublicBusinessProfileSerializer, PublicPaymentMethodSerializer


@extend_schema(tags=["Public Business"])
class PublicBusinessProfileView(APIView):
    serializer_class = PublicBusinessProfileSerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [PublicReadRateThrottle]

    def get(self, request) -> Response:
        profile = get_business_profile()
        return Response(
            {"data": PublicBusinessProfileSerializer(profile).data, "message": "Success"}
        )


@extend_schema(tags=["Public Business"])
class PublicPaymentMethodListView(APIView):
    serializer_class = PublicPaymentMethodSerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [PublicReadRateThrottle]

    def get(self, request) -> Response:
        offered = [row for row in payment_methods_list() if row["is_enabled"]]
        return Response(
            {
                "data": PublicPaymentMethodSerializer(offered, many=True).data,
                "message": "Success",
            }
        )
