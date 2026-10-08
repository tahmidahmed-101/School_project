from django.urls import path

from .views import (
    PublicBusinessProfileView,
    PublicPaymentMethodListView,
    PublicStorefrontContentView,
    PublicStorePolicyView,
)

urlpatterns = [
    path("business-profile/", PublicBusinessProfileView.as_view(), name="business-profile"),
    path("payment-methods/", PublicPaymentMethodListView.as_view(), name="payment-method-list"),
    path(
        "storefront-content/",
        PublicStorefrontContentView.as_view(),
        name="storefront-content",
    ),
    path("policies/<str:kind>/", PublicStorePolicyView.as_view(), name="store-policy"),
]
