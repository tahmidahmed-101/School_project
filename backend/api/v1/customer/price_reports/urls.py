from __future__ import annotations

from django.urls import path

from .views import CustomerPriceReportCreateView

app_name = "customer_price_reports"

urlpatterns = [
    path(
        "products/<uuid:product_id>/",
        CustomerPriceReportCreateView.as_view(),
        name="price-report-create",
    ),
]
