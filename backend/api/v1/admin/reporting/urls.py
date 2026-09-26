from __future__ import annotations

from django.urls import path

from .views import DashboardView, LowStockSummaryView, SalesTrendView, StockTurnoverView

app_name = "admin_reporting"

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("sales-trend/", SalesTrendView.as_view(), name="sales-trend"),
    path("stock-turnover/", StockTurnoverView.as_view(), name="stock-turnover"),
    path("low-stock/", LowStockSummaryView.as_view(), name="low-stock"),
]
