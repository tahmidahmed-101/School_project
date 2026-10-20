from __future__ import annotations

from django.urls import path

from .views import (
    AdminBulkStockAdjustmentView,
    AdminQuickProductCreateView,
    AdminStockAdjustmentView,
    AdminStockIntakeView,
    AdminStockItemDetailView,
    AdminStockItemListView,
    AdminStockLedgerEntryExportView,
    AdminStockLedgerEntryListView,
    AdminStockLookupView,
    AdminStockStatusView,
    AdminStockTransferDetailView,
    AdminStockTransferListCreateView,
    AdminStockWriteOffView,
    AdminWarehouseDetailView,
    AdminWarehouseListCreateView,
)

app_name = "admin_inventory"

urlpatterns = [
    path("warehouses/", AdminWarehouseListCreateView.as_view(), name="warehouse-list"),
    path(
        "warehouses/<uuid:warehouse_id>/",
        AdminWarehouseDetailView.as_view(),
        name="warehouse-detail",
    ),
    path("stock-items/", AdminStockItemListView.as_view(), name="stock-item-list"),
    path(
        "stock-items/<uuid:stock_item_id>/",
        AdminStockItemDetailView.as_view(),
        name="stock-item-detail",
    ),
    path("ledger-entries/", AdminStockLedgerEntryListView.as_view(), name="ledger-entry-list"),
    path(
        "ledger-entries/export/",
        AdminStockLedgerEntryExportView.as_view(),
        name="ledger-entry-export",
    ),
    path("adjustments/", AdminStockAdjustmentView.as_view(), name="stock-adjustment"),
    path("adjustments/bulk/", AdminBulkStockAdjustmentView.as_view(), name="stock-adjustment-bulk"),
    path("write-offs/", AdminStockWriteOffView.as_view(), name="stock-write-off"),
    path("transfers/", AdminStockTransferListCreateView.as_view(), name="stock-transfer-list"),
    path(
        "transfers/<uuid:transfer_id>/",
        AdminStockTransferDetailView.as_view(),
        name="stock-transfer-detail",
    ),
    path("stock-status/", AdminStockStatusView.as_view(), name="stock-status"),
    path("lookup/", AdminStockLookupView.as_view(), name="stock-lookup"),
    path("intake/", AdminStockIntakeView.as_view(), name="stock-intake"),
    path("quick-products/", AdminQuickProductCreateView.as_view(), name="quick-product-create"),
]
