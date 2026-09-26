from __future__ import annotations

import contextlib
from typing import ClassVar

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.selectors.users import user_permissions
from apps.accounts.services import authentication
from apps.accounts.services.phone_verification import (
    confirm_phone_change as svc_confirm_phone_change,
)
from apps.accounts.services.phone_verification import (
    request_phone_change as svc_request_phone_change,
)
from apps.accounts.services.phone_verification import (
    request_phone_verification as svc_request_phone_verification,
)
from apps.accounts.services.phone_verification import (
    verify_phone as svc_verify_phone,
)
from apps.common.exceptions import DomainError
from apps.common.responses import error_from_exception
from apps.common.throttling import AuthRateThrottle, LoginRateThrottle, OtpRateThrottle

from .serializers import (
    ConfirmPhoneChangeSerializer,
    ForgotPasswordSerializer,
    LoginSerializer,
    PhoneVerificationCodeSerializer,
    RegisterSerializer,
    RequestPhoneChangeSerializer,
    ResetPasswordSerializer,
    UserSummarySerializer,
    VerifyEmailSerializer,
)


def _set_refresh_cookie(response: Response, refresh_token: str, *, max_age: int) -> None:
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        refresh_token,
        max_age=max_age,
        httponly=True,
        secure=not settings.DEBUG,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
        path="/api/v1/customer/auth/",
    )


def _user_data(user) -> dict:
    role = "admin" if getattr(user, "is_superuser", False) else user.role
    return UserSummarySerializer(
        {
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "role": role,
            "phone": user.phone,
            "profile_picture": user.profile_picture,
            "is_email_verified": user.is_email_verified,
            "is_phone_verified": user.is_phone_verified,
            "permissions": user_permissions(user),
        }
    ).data


@extend_schema(tags=["Auth"])
class RegisterView(APIView):
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [AuthRateThrottle]

    @extend_schema(
        request=RegisterSerializer,
        responses={201: OpenApiTypes.OBJECT},
        examples=[
            OpenApiExample(
                "Register request",
                value={
                    "email": "customer@example.com",
                    "password": "StrongPass123",
                    "first_name": "Jane",
                    "last_name": "Doe",
                    "phone": "+15550000000",
                },
                request_only=True,
            ),
            OpenApiExample(
                "Register response",
                value={
                    "data": {
                        "id": "11111111-1111-1111-1111-111111111111",
                        "email": "customer@example.com",
                        "first_name": "Jane",
                        "last_name": "Doe",
                        "role": "customer",
                        "phone": "+15550000000",
                        "profile_picture": "",
                        "is_email_verified": False,
                        "permissions": [],
                    },
                    "message": "Success",
                },
                response_only=True,
            ),
        ],
    )
    def post(self, request) -> Response:
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = authentication.register_customer(**serializer.validated_data)
        except (DomainError, DjangoValidationError) as exc:
            return error_from_exception(exc)
        return Response(
            {"data": _user_data(user), "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Auth"])
class LoginView(APIView):
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [AuthRateThrottle, LoginRateThrottle]

    @extend_schema(
        request=LoginSerializer,
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Login request",
                value={"email": "customer@example.com", "password": "StrongPass123"},
                request_only=True,
            ),
            OpenApiExample(
                "Login response",
                value={
                    "data": {
                        "access": "eyJhbGciOiJIUzI1NiIs...",
                        "user": {
                            "id": "11111111-1111-1111-1111-111111111111",
                            "email": "customer@example.com",
                            "first_name": "Jane",
                            "last_name": "Doe",
                            "role": "customer",
                            "phone": "+15550000000",
                            "profile_picture": "",
                            "is_email_verified": False,
                            "permissions": [],
                        },
                    },
                    "message": "Success",
                },
                response_only=True,
            ),
        ],
    )
    def post(self, request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        remember_me = serializer.validated_data.pop("remember_me")
        try:
            user = authentication.authenticate_user(**serializer.validated_data)
        except DomainError as exc:
            return error_from_exception(exc, status.HTTP_401_UNAUTHORIZED)
        tokens = authentication.issue_tokens(user, remember_me=remember_me)
        response = Response(
            {
                "data": {"access": tokens["access"], "user": _user_data(user)},
                "message": "Success",
            }
        )
        max_age = int(
            (
                settings.REMEMBER_ME_REFRESH_TOKEN_LIFETIME
                if remember_me
                else settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]
            ).total_seconds()
        )
        _set_refresh_cookie(response, tokens["refresh"], max_age=max_age)
        return response


@extend_schema(tags=["Auth"])
class RefreshView(APIView):
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [AuthRateThrottle]

    @extend_schema(
        request=None,
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Refresh response",
                value={
                    "data": {"access": "eyJhbGciOiJIUzI1NiIs..."},
                    "message": "Success",
                },
                response_only=True,
            ),
        ],
    )
    def post(self, request) -> Response:
        """Reads the refresh token from its HttpOnly cookie rather than the
        request body, and rotates that cookie in place when rotation is on —
        the client never sees the refresh token at all."""
        refresh_token = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if not refresh_token:
            exc = DomainError("No refresh token.", code="auth_invalid_refresh")
            return error_from_exception(exc, status.HTTP_401_UNAUTHORIZED)
        try:
            tokens = authentication.rotate_refresh_token(refresh_token)
        except DomainError as exc:
            return error_from_exception(exc, status.HTTP_401_UNAUTHORIZED)
        response = Response({"data": {"access": tokens["access"]}, "message": "Success"})
        if "refresh" in tokens:
            _set_refresh_cookie(
                response,
                tokens["refresh"],
                max_age=int(tokens["refresh_max_age"]),
            )
        return response


@extend_schema(tags=["Auth"])
class LogoutView(APIView):
    # The cookie is the credential being revoked. Requiring a live access token
    # meant a tab idle past the 15-minute expiry could not log out at all.
    permission_classes: ClassVar[list] = [AllowAny]

    @extend_schema(request=None, responses={204: None})
    def post(self, request) -> Response:
        refresh_token = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if refresh_token:
            # Expired, already blacklisted or malformed — the session is gone
            # either way, so clear the cookie rather than 400.
            with contextlib.suppress(DomainError):
                authentication.logout_refresh_token(refresh_token)
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(settings.REFRESH_COOKIE_NAME, path="/api/v1/customer/auth/")
        return response


@extend_schema(tags=["Auth"])
class MeView(APIView):
    permission_classes: ClassVar[list] = [IsAuthenticated]

    @extend_schema(
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Me response",
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


@extend_schema(tags=["Auth"])
class RequestEmailVerificationView(APIView):
    permission_classes: ClassVar[list] = [IsAuthenticated]
    throttle_classes: ClassVar[list] = [OtpRateThrottle]

    @extend_schema(
        request=None,
        responses=dict,
        examples=[
            OpenApiExample(
                "Request email verification response",
                value={"data": {}, "message": "Verification code sent."},
                response_only=True,
            ),
        ],
    )
    def post(self, request) -> Response:
        authentication.request_email_verification(request.user)
        return Response({"data": {}, "message": "Verification code sent."})


@extend_schema(tags=["Auth"])
class VerifyEmailView(APIView):
    permission_classes: ClassVar[list] = [IsAuthenticated]

    @extend_schema(
        request=VerifyEmailSerializer,
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Verify email request",
                value={"code": "123456"},
                request_only=True,
            ),
            OpenApiExample(
                "Verify email response",
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
                    "message": "Email verified.",
                },
                response_only=True,
            ),
        ],
    )
    def post(self, request) -> Response:
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            authentication.verify_email(user=request.user, **serializer.validated_data)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": _user_data(request.user), "message": "Email verified."})


@extend_schema(tags=["Auth"])
class ForgotPasswordView(APIView):
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [AuthRateThrottle]

    @extend_schema(
        request=ForgotPasswordSerializer,
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Forgot password request",
                value={"email": "customer@example.com"},
                request_only=True,
            ),
            OpenApiExample(
                "Forgot password response",
                value={"data": {}, "message": "If the email exists, a reset code was sent."},
                response_only=True,
            ),
        ],
    )
    def post(self, request) -> Response:
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        authentication.request_password_reset(serializer.validated_data["email"])
        return Response({"data": {}, "message": "If the email exists, a reset code was sent."})


@extend_schema(tags=["Auth"])
class ResetPasswordView(APIView):
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [AuthRateThrottle]

    @extend_schema(
        request=ResetPasswordSerializer,
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Reset password request",
                value={
                    "email": "customer@example.com",
                    "code": "123456",
                    "new_password": "NewStrongPass123",
                },
                request_only=True,
            ),
            OpenApiExample(
                "Reset password response",
                value={"data": {}, "message": "Password reset successful."},
                response_only=True,
            ),
        ],
    )
    def post(self, request) -> Response:
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            authentication.reset_password(**serializer.validated_data)
        except (DomainError, DjangoValidationError) as exc:
            return error_from_exception(exc)
        return Response({"data": {}, "message": "Password reset successful."})


@extend_schema(tags=["Auth"])
class RequestPhoneVerificationView(APIView):
    permission_classes: ClassVar[list] = [IsAuthenticated]
    throttle_classes: ClassVar[list] = [OtpRateThrottle]

    @extend_schema(
        request=None,
        responses=dict,
        examples=[
            OpenApiExample(
                "Request phone verification response",
                value={"data": {}, "message": "Verification code sent to your phone."},
                response_only=True,
            ),
        ],
    )
    def post(self, request) -> Response:
        try:
            svc_request_phone_verification(user=request.user)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": {}, "message": "Verification code sent to your phone."})


@extend_schema(tags=["Auth"])
class VerifyPhoneView(APIView):
    permission_classes: ClassVar[list] = [IsAuthenticated]

    @extend_schema(
        request=PhoneVerificationCodeSerializer,
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Verify phone request",
                value={"code": "123456"},
                request_only=True,
            ),
            OpenApiExample(
                "Verify phone response",
                value={
                    "data": {
                        "id": "11111111-1111-1111-1111-111111111111",
                        "email": "customer@example.com",
                        "is_phone_verified": True,
                    },
                    "message": "Phone verified.",
                },
                response_only=True,
            ),
        ],
    )
    def post(self, request) -> Response:
        serializer = PhoneVerificationCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            svc_verify_phone(user=request.user, **serializer.validated_data)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": _user_data(request.user), "message": "Phone verified."})


@extend_schema(tags=["Auth"])
class RequestPhoneChangeView(APIView):
    permission_classes: ClassVar[list] = [IsAuthenticated]
    throttle_classes: ClassVar[list] = [OtpRateThrottle]

    @extend_schema(
        request=RequestPhoneChangeSerializer,
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Request phone change request",
                value={"new_phone": "+15551112222"},
                request_only=True,
            ),
            OpenApiExample(
                "Request phone change response",
                value={"data": {}, "message": "Verification code sent to new phone number."},
                response_only=True,
            ),
        ],
    )
    def post(self, request) -> Response:
        serializer = RequestPhoneChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            svc_request_phone_change(user=request.user, **serializer.validated_data)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": {}, "message": "Verification code sent to new phone number."})


@extend_schema(tags=["Auth"])
class ConfirmPhoneChangeView(APIView):
    permission_classes: ClassVar[list] = [IsAuthenticated]

    @extend_schema(
        request=ConfirmPhoneChangeSerializer,
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Confirm phone change request",
                value={"code": "123456", "new_phone": "+15551112222"},
                request_only=True,
            ),
            OpenApiExample(
                "Confirm phone change response",
                value={
                    "data": {
                        "id": "11111111-1111-1111-1111-111111111111",
                        "phone": "+15551112222",
                        "is_phone_verified": True,
                    },
                    "message": "Phone number updated.",
                },
                response_only=True,
            ),
        ],
    )
    def post(self, request) -> Response:
        serializer = ConfirmPhoneChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            svc_confirm_phone_change(user=request.user, **serializer.validated_data)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": _user_data(request.user), "message": "Phone number updated."})
