from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.exceptions import DomainError
from apps.common.responses import error_from_exception
from apps.orders.services.guest_checkout import guest_checkout

from .serializers import GuestCheckoutSerializer, GuestOrderSerializer


@extend_schema(tags=["Public Checkout"])
class GuestCheckoutView(APIView):
    serializer_class = GuestCheckoutSerializer
    permission_classes: ClassVar[list] = [AllowAny]

    def post(self, request) -> Response:
        serializer = GuestCheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        try:
            order = guest_checkout(**data)
        except DomainError as exc:
            return error_from_exception(exc)

        return Response(
            {"data": GuestOrderSerializer(order).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )