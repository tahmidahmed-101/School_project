from __future__ import annotations

from typing import ClassVar

from django.http import HttpRequest, HttpResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.business.selectors.business_profile import get_business_profile
from apps.common.exceptions import DomainError
from apps.common.responses import error_from_exception
from apps.common.throttling import AuthRateThrottle
from apps.marketing.services.sms_subscribers import (
    sms_subscriber_for_token,
    sms_unsubscribe_by_token,
)
from apps.marketing.services.subscribers import (
    subscribe,
    subscriber_for_token,
    unsubscribe,
    unsubscribe_by_token,
)

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
        # The same answer whether or not the address was subscribed.
        unsubscribe(email=serializer.validated_data["email"])
        return Response({"data": {}, "message": "Success"})


def _unsubscribe_page(request: HttpRequest, token: str, *, sms: bool) -> HttpResponse:
    unsubscribe_by, find = (
        (sms_unsubscribe_by_token, sms_subscriber_for_token)
        if sms
        else (unsubscribe_by_token, subscriber_for_token)
    )
    context = {"shop": get_business_profile().name, "done": False, "invalid": False, "sms": sms}
    if request.method == "POST":
        context["done"] = unsubscribe_by(token)
        context["invalid"] = not context["done"]
    else:
        context["invalid"] = find(token) is None
    response = render(
        request, "marketing/unsubscribe.html", context, status=404 if context["invalid"] else 200
    )
    response["X-Robots-Tag"] = "noindex, nofollow"
    response["Referrer-Policy"] = "no-referrer"
    return response


@csrf_exempt  # The signed token is the authorisation; mail clients post without a session.
@require_http_methods(["GET", "POST"])
def newsletter_unsubscribe_page(request: HttpRequest, token: str) -> HttpResponse:
    """The link at the foot of every campaign email. GET asks to confirm, so a
    link scanner opening it unsubscribes no one; POST unsubscribes, which is
    also what a mail client's one-click button (RFC 8058) sends."""
    return _unsubscribe_page(request, token, sms=False)


@csrf_exempt  # The signed token is the authorisation; a text has no session.
@require_http_methods(["GET", "POST"])
def sms_unsubscribe_page(request: HttpRequest, token: str) -> HttpResponse:
    """The opt-out link in every campaign text, same GET-confirms rule."""
    return _unsubscribe_page(request, token, sms=True)
