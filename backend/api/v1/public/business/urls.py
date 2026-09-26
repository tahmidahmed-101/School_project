from django.urls import path

from .views import PublicBusinessProfileView, PublicPaymentMethodListView

urlpatterns = [
    path("business-profile/", PublicBusinessProfileView.as_view(), name="business-profile"),
    path("payment-methods/", PublicPaymentMethodListView.as_view(), name="payment-method-list"),
]
