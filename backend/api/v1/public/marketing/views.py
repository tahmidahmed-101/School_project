from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.exceptions import DomainError
from apps.common.responses import error_from_exception
from apps.common.throttling import AuthRateThrottle
from apps.marketing.services.subscribers import subscribe, unsubscribe

from .serializers import NewsletterEmailSerializer


@extend_schema(tags=["Newsletter"])
class NewsletterSubscribeView(APIView):
    serializer_class = NewsletterEmailSerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [AuthRateThrottle]

    def post(self, request) -> Response:
        serializer = NewsletterEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            subscribe(email=serializer.validated_data["email"])
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": {}, "message": "Success"}, status=status.HTTP_201_CREATED)


@extend_schema(tags=["Newsletter"])
class NewsletterUnsubscribeView(APIView):
    serializer_class = NewsletterEmailSerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [AuthRateThrottle]

    def post(self, request) -> Response:
        serializer = NewsletterEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            unsubscribe(email=serializer.validated_data["email"])
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": {}, "message": "Success"})
