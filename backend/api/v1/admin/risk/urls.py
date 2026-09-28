from __future__ import annotations

from django.urls import path

from .views import (
    AdminFraudCaseDetailView,
    AdminFraudCaseListView,
    AdminFraudCaseResolveView,
    AdminIPBlocklistView,
    AdminOrderRiskAssessView,
    AdminPhoneBlockLiftView,
    AdminPhoneBlocklistView,
)

app_name = "admin_risk"

urlpatterns = [
    path("orders/<uuid:order_id>/assess/", AdminOrderRiskAssessView.as_view(), name="order-assess"),
    path("cases/", AdminFraudCaseListView.as_view(), name="case-list"),
    path("cases/<uuid:case_id>/", AdminFraudCaseDetailView.as_view(), name="case-detail"),
    path(
        "cases/<uuid:case_id>/resolve/",
        AdminFraudCaseResolveView.as_view(),
        name="case-resolve",
    ),
    path("ip-blocklist/", AdminIPBlocklistView.as_view(), name="ip-blocklist"),
    path("phone-blocklist/", AdminPhoneBlocklistView.as_view(), name="phone-blocklist"),
    path(
        "phone-blocklist/<str:phone_number>/lift/",
        AdminPhoneBlockLiftView.as_view(),
        name="phone-blocklist-lift",
    ),
]
