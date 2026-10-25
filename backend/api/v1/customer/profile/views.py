from __future__ import annotations

from typing import ClassVar

from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.customer.auth.views import _user_data
from apps.accounts.services.authentication import change_password
from apps.accounts.services.users import update_user_profile, update_user_profile_image
from apps.common.exceptions import BusinessRuleViolationError, DomainError
from apps.common.responses import error_from_exception
from apps.common.utils.phone import e164_bd_mobile
from apps.marketing.services.sms_subscribers import is_sms_opted_in, sms_opt_in, sms_opt_out

from .serializers import (
    ChangePasswordSerializer,
    ProfileImageSerializer,
    ProfileUpdateSerializer,
    SmsMarketingSerializer,
)


@extend_schema(tags=["Profile"])
class ProfileView(APIView):
    permission_classes: ClassVar[list] = [IsAuthenticated]

    @extend_schema(
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Profile response",
                value={
                    "data": {
                        "id": "11111111-1111-1111-1111-111111111111",
                        "email": "customer@example.com",
                        "first_name": "Jane",
                        "last_name": "Doe",
                        "role": "customer",
                        "phone": "+15550000000",
                        "profile_picture": "",
                        "is_email_verified": True,
                        "permissions": [],
                    },
                    "message": "Success",
                },
                response_only=True,
            ),
        ],
    )
    def get(self, request) -> Response:
        return Response({"data": _user_data(request.user), "message": "Success"})

    @extend_schema(
        request=ProfileUpdateSerializer,
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Profile update request",
                value={"first_name": "Jane", "last_name": "Smith"},
                request_only=True,
            ),
            OpenApiExample(
                "Profile update response",
                value={
                    "data": {
                        "id": "11111111-1111-1111-1111-111111111111",
                        "email": "customer@example.com",
                        "first_name": "Jane",
                        "last_name": "Smith",
                        "role": "customer",
                        "phone": "+15550000000",
                        "profile_picture": "",
                        "is_email_verified": True,
                        "permissions": [],
                    },
                    "message": "Success",
                },
                response_only=True,
            ),
        ],
    )
    def patch(self, request) -> Response:
        serializer = ProfileUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = update_user_profile(request.user, serializer.validated_data)
        return Response({"data": _user_data(user), "message": "Success"})


@extend_schema(tags=["Profile"])
class ProfileImageView(APIView):
    permission_classes: ClassVar[list] = [IsAuthenticated]

    @extend_schema(
        request=ProfileImageSerializer,
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Profile image request",
                value={"profile_picture": "https://cdn.example.com/profiles/jane.png"},
                request_only=True,
            ),
            OpenApiExample(
                "Profile image response",
                value={
                    "data": {
                        "id": "11111111-1111-1111-1111-111111111111",
                        "email": "customer@example.com",
                        "first_name": "Jane",
                        "last_name": "Doe",
                        "role": "customer",
                        "phone": "+15550000000",
                        "profile_picture": "https://cdn.example.com/profiles/jane.png",
                        "is_email_verified": True,
                        "permissions": [],
                    },
                    "message": "Success",
                },
                response_only=True,
            ),
        ],
    )
    def patch(self, request) -> Response:
        serializer = ProfileImageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = update_user_profile_image(
            user=request.user,
            profile_picture=serializer.validated_data["profile_picture"],
        )
        return Response({"data": _user_data(user), "message": "Success"})


@extend_schema(tags=["Profile"])
class ChangePasswordView(APIView):
    permission_classes: ClassVar[list] = [IsAuthenticated]

    @extend_schema(
        request=ChangePasswordSerializer,
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Change password request",
                value={"old_password": "OldStrongPass123", "new_password": "NewStrongPass123"},
                request_only=True,
            ),
            OpenApiExample(
                "Change password response",
                value={"data": {}, "message": "Password changed."},
                response_only=True,
            ),
        ],
    )
    def post(self, request) -> Response:
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            change_password(user=request.user, **serializer.validated_data)
        except (DomainError, DjangoValidationError) as exc:
            return error_from_exception(exc)
        return Response({"data": {}, "message": "Password changed."})


@extend_schema(tags=["Profile"])
class SmsMarketingView(APIView):
    """Whether marketing texts go to the number on the account. Order and
    login messages are not affected."""

    permission_classes: ClassVar[list] = [IsAuthenticated]
    serializer_class = SmsMarketingSerializer

    def _state(self, user) -> Response:
        data = {"phone": e164_bd_mobile(user.phone), "opted_in": is_sms_opted_in(user.phone)}
        return Response({"data": data, "message": "Success"})

    def get(self, request) -> Response:
        return self._state(request.user)

    @extend_schema(request=SmsMarketingSerializer)
    def patch(self, request) -> Response:
        serializer = SmsMarketingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not serializer.validated_data["opted_in"]:
            sms_opt_out(phone=request.user.phone)
        elif sms_opt_in(phone=request.user.phone) is None:
            return error_from_exception(
                BusinessRuleViolationError(
                    "Add a Bangladeshi mobile number to your account first.",
                    code="invalid_phone",
                )
            )
        return self._state(request.user)
