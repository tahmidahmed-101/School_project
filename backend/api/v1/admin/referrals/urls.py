from __future__ import annotations

from django.urls import path

from .views import AdminReferralListView

app_name = "admin_referrals"

urlpatterns = [
    path("", AdminReferralListView.as_view(), name="referral-list"),
]
