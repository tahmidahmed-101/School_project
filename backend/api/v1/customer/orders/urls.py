from __future__ import annotations

from django.urls import path

from .views import (
    CartCouponView,
    CartLineDetailView,
    CartLineListCreateView,
    CartShippingOptionListView,
    CartShippingQuoteView,
    CartShippingZoneListView,
    CartView,
    CheckoutView,
    OrderCancelView,
    OrderDetailView,
    OrderHistoryListView,
    PaymentCaptureView,
    RMADetailView,
    RMAListCreateView,
)

app_name = "customer_orders"

urlpatterns = [
    path("cart/", CartView.as_view(), name="cart"),
    path("cart/lines/", CartLineListCreateView.as_view(), name="cart-line-list"),
    path("cart/lines/<uuid:line_id>/", CartLineDetailView.as_view(), name="cart-line-detail"),
    path("cart/coupon/", CartCouponView.as_view(), name="cart-coupon"),
    path("cart/shipping-quote/", CartShippingQuoteView.as_view(), name="cart-shipping-quote"),
    path(
        "cart/shipping-options/",
        CartShippingOptionListView.as_view(),
        name="cart-shipping-options",
    ),
    path("cart/shipping-zones/", CartShippingZoneListView.as_view(), name="cart-shipping-zones"),
    path("cart/checkout/", CheckoutView.as_view(), name="checkout"),
    path("cart/payment/", PaymentCaptureView.as_view(), name="payment-capture"),
    path("", OrderHistoryListView.as_view(), name="order-history"),
    path("<uuid:order_id>/", OrderDetailView.as_view(), name="order-detail"),
    path("<uuid:order_id>/cancel/", OrderCancelView.as_view(), name="order-cancel"),
    path("<uuid:order_id>/returns/", RMAListCreateView.as_view(), name="rma-list"),
    path("returns/<uuid:rma_id>/", RMADetailView.as_view(), name="rma-detail"),
]
