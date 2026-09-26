from __future__ import annotations

from django.urls import path

from .views import ChangePasswordView, ProfileImageView, ProfileView

app_name = "customer_profile"

urlpatterns = [
    path("", ProfileView.as_view(), name="profile"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("image/", ProfileImageView.as_view(), name="profile-image"),
]
