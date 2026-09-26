from django.urls import path

from .views import (
    AdminBusinessProfileView,
    AdminIntegrationStatusView,
    AdminModuleDetailView,
    AdminModuleListView,
    AdminPaymentMethodDetailView,
    AdminPaymentMethodListView,
)

urlpatterns = [
    path("business-profile/", AdminBusinessProfileView.as_view(), name="business-profile"),
    path("integrations/", AdminIntegrationStatusView.as_view(), name="integration-status"),
    path("modules/", AdminModuleListView.as_view(), name="module-list"),
    path("payment-methods/", AdminPaymentMethodListView.as_view(), name="payment-method-list"),
    path(
        "payment-methods/<str:key>/",
        AdminPaymentMethodDetailView.as_view(),
        name="payment-method-detail",
    ),
    path("modules/<str:key>/", AdminModuleDetailView.as_view(), name="module-detail"),
]
