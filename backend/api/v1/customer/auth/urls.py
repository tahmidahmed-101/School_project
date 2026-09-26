from __future__ import annotations

from django.urls import path

from .views import (
    ConfirmPhoneChangeView,
    ForgotPasswordView,
    LoginView,
    LogoutView,
    MeView,
    RefreshView,
    RegisterView,
    RequestEmailVerificationView,
    RequestPhoneChangeView,
    RequestPhoneVerificationView,
    ResetPasswordView,
    VerifyEmailView,
    VerifyPhoneView,
)

app_name = "customer_auth"

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("refresh/", RefreshView.as_view(), name="refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
    path(
        "request-email-verification/",
        RequestEmailVerificationView.as_view(),
        name="request-email-verification",
    ),
    path("verify-email/", VerifyEmailView.as_view(), name="verify-email"),
    path(
        "request-phone-verification/",
        RequestPhoneVerificationView.as_view(),
        name="request-phone-verification",
    ),
    path("verify-phone/", VerifyPhoneView.as_view(), name="verify-phone"),
    path(
        "request-phone-change/",
        RequestPhoneChangeView.as_view(),
        name="request-phone-change",
    ),
    path(
        "confirm-phone-change/",
        ConfirmPhoneChangeView.as_view(),
        name="confirm-phone-change",
    ),
    path("forgot-password/", ForgotPasswordView.as_view(), name="forgot-password"),
    path("reset-password/", ResetPasswordView.as_view(), name="reset-password"),
]
