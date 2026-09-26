from __future__ import annotations

from django.urls import path

from .views import AdminCouponDetailView, AdminCouponListCreateView, AdminCouponRestoreView

app_name = "admin_coupons"

urlpatterns = [
    path("", AdminCouponListCreateView.as_view(), name="coupon-list"),
    path("<uuid:coupon_id>/", AdminCouponDetailView.as_view(), name="coupon-detail"),
    path("<uuid:coupon_id>/restore/", AdminCouponRestoreView.as_view(), name="coupon-restore"),
]
