from __future__ import annotations

from django.urls import path

from .views import CustomerReferralView

app_name = "customer_referral"

urlpatterns = [
    path("", CustomerReferralView.as_view(), name="referral-summary"),
]
