from __future__ import annotations

from django.urls import path

from .views import AdminSaleDetailView, AdminSaleListCreateView

app_name = "admin_sales"

urlpatterns = [
    path("", AdminSaleListCreateView.as_view(), name="sale-list"),
    path("<uuid:sale_id>/", AdminSaleDetailView.as_view(), name="sale-detail"),
]
