from __future__ import annotations

from django.urls import path

from .views import (
    AdminGoodsReceiptDetailView,
    AdminGoodsReceiptListCreateView,
    AdminPurchaseOrderCancelView,
    AdminPurchaseOrderDetailView,
    AdminPurchaseOrderLineCreateView,
    AdminPurchaseOrderLineDetailView,
    AdminPurchaseOrderListCreateView,
    AdminPurchaseOrderPdfView,
    AdminPurchaseOrderSubmitView,
    AdminSupplierDetailView,
    AdminSupplierListCreateView,
    AdminSupplierRestoreView,
    AdminVendorBillDetailView,
    AdminVendorBillListCreateView,
    AdminVendorBillPdfView,
    AdminVendorBillVoidView,
    AdminVendorPaymentDetailView,
    AdminVendorPaymentListView,
    AdminVendorPaymentView,
)

app_name = "admin_procurement"

urlpatterns = [
    path("suppliers/", AdminSupplierListCreateView.as_view(), name="supplier-list"),
    path(
        "suppliers/<uuid:supplier_id>/", AdminSupplierDetailView.as_view(), name="supplier-detail"
    ),
    path(
        "suppliers/<uuid:supplier_id>/restore/",
        AdminSupplierRestoreView.as_view(),
        name="supplier-restore",
    ),
    path("purchase-orders/", AdminPurchaseOrderListCreateView.as_view(), name="po-list"),
    path("purchase-orders/<uuid:po_id>/", AdminPurchaseOrderDetailView.as_view(), name="po-detail"),
    path(
        "purchase-orders/<uuid:po_id>/pdf/",
        AdminPurchaseOrderPdfView.as_view(),
        name="po-pdf",
    ),
    path(
        "purchase-orders/<uuid:po_id>/lines/",
        AdminPurchaseOrderLineCreateView.as_view(),
        name="po-line-create",
    ),
    path(
        "purchase-orders/<uuid:po_id>/lines/<uuid:line_id>/",
        AdminPurchaseOrderLineDetailView.as_view(),
        name="po-line-detail",
    ),
    path(
        "purchase-orders/<uuid:po_id>/submit/",
        AdminPurchaseOrderSubmitView.as_view(),
        name="po-submit",
    ),
    path(
        "purchase-orders/<uuid:po_id>/cancel/",
        AdminPurchaseOrderCancelView.as_view(),
        name="po-cancel",
    ),
    path("goods-receipts/", AdminGoodsReceiptListCreateView.as_view(), name="grn-list"),
    path(
        "goods-receipts/<uuid:grn_id>/",
        AdminGoodsReceiptDetailView.as_view(),
        name="grn-detail",
    ),
    path("vendor-bills/", AdminVendorBillListCreateView.as_view(), name="vendor-bill-list"),
    path(
        "vendor-bills/<uuid:bill_id>/",
        AdminVendorBillDetailView.as_view(),
        name="vendor-bill-detail",
    ),
    path(
        "vendor-bills/<uuid:bill_id>/pdf/",
        AdminVendorBillPdfView.as_view(),
        name="vendor-bill-pdf",
    ),
    path(
        "vendor-bills/<uuid:bill_id>/void/",
        AdminVendorBillVoidView.as_view(),
        name="vendor-bill-void",
    ),
    path(
        "vendor-bills/<uuid:bill_id>/payments/",
        AdminVendorPaymentView.as_view(),
        name="vendor-bill-payment",
    ),
    path("vendor-payments/", AdminVendorPaymentListView.as_view(), name="vendor-payment-list"),
    path(
        "vendor-payments/<uuid:payment_id>/",
        AdminVendorPaymentDetailView.as_view(),
        name="vendor-payment-detail",
    ),
]
