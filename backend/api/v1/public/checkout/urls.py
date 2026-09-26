from django.urls import path

from .views import (
    CouponValidationView,
    GuestCheckoutView,
    ShippingOptionListView,
    ShippingQuoteView,
    ShippingZoneListView,
)

app_name = "public_checkout"

urlpatterns = [
    path("", GuestCheckoutView.as_view(), name="guest-checkout"),
    path("coupon/", CouponValidationView.as_view(), name="coupon-validate"),
    path("shipping-quote/", ShippingQuoteView.as_view(), name="shipping-quote"),
    path("shipping-options/", ShippingOptionListView.as_view(), name="shipping-options"),
    path("shipping-zones/", ShippingZoneListView.as_view(), name="shipping-zones"),
]
