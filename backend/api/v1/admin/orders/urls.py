from __future__ import annotations

from django.urls import path

from .views import (
    AdminCustomerCartListView,
    AdminOrderCancelView,
    AdminOrderCapturePaymentView,
    AdminOrderDetailView,
    AdminOrderExportView,
    AdminOrderInvoicePdfView,
    AdminOrderLineDetailView,
    AdminOrderListView,
    AdminOrderRMACreateView,
    AdminOrderShipmentCreateView,
    AdminOrderStatusView,
    AdminPaymentDetailView,
    AdminPaymentListView,
    AdminPaymentRefundView,
    AdminReservationDetailView,
    AdminReservationListView,
    AdminReservationReleaseView,
    AdminRMAActionView,
    AdminRMADetailView,
    AdminRMALineGradeView,
    AdminRMAListView,
    AdminShipmentDetailView,
    AdminShipmentDispatchView,
    AdminShipmentListCreateView,
    AdminShipmentReceiveBackView,
    AdminShipmentReplaceDamagedView,
    AdminShipmentStatusUpdateView,
)

app_name = "admin_orders"

urlpatterns = [
    path("", AdminOrderListView.as_view(), name="order-list"),
    path("export/", AdminOrderExportView.as_view(), name="order-export"),
    path("<uuid:order_id>/", AdminOrderDetailView.as_view(), name="order-detail"),
    path(
        "<uuid:order_id>/invoice/",
        AdminOrderInvoicePdfView.as_view(),
        name="order-invoice-pdf",
    ),
    path(
        "<uuid:order_id>/status/",
        AdminOrderStatusView.as_view(),
        name="order-status",
    ),
    path(
        "<uuid:order_id>/lines/<uuid:line_id>/",
        AdminOrderLineDetailView.as_view(),
        name="order-line-detail",
    ),
    path(
        "<uuid:order_id>/cancel/",
        AdminOrderCancelView.as_view(),
        name="order-cancel",
    ),
    path(
        "<uuid:order_id>/shipments/",
        AdminOrderShipmentCreateView.as_view(),
        name="order-shipment-create",
    ),
    path(
        "<uuid:order_id>/returns/",
        AdminOrderRMACreateView.as_view(),
        name="order-rma-create",
    ),
    path(
        "<uuid:order_id>/capture-payment/",
        AdminOrderCapturePaymentView.as_view(),
        name="order-capture-payment",
    ),
    path("payments/", AdminPaymentListView.as_view(), name="payment-list"),
    path(
        "payments/<uuid:payment_id>/refund/",
        AdminPaymentRefundView.as_view(),
        name="payment-refund",
    ),
    path(
        "payments/<uuid:payment_id>/",
        AdminPaymentDetailView.as_view(),
        name="payment-detail",
    ),
    path("carts/", AdminCustomerCartListView.as_view(), name="customer-cart-list"),
    path("reservations/", AdminReservationListView.as_view(), name="reservation-list"),
    path(
        "reservations/<uuid:reservation_id>/release/",
        AdminReservationReleaseView.as_view(),
        name="reservation-release",
    ),
    path(
        "reservations/<uuid:reservation_id>/",
        AdminReservationDetailView.as_view(),
        name="reservation-detail",
    ),
    path("shipments/", AdminShipmentListCreateView.as_view(), name="shipment-list"),
    path(
        "shipments/<uuid:shipment_id>/",
        AdminShipmentDetailView.as_view(),
        name="shipment-detail",
    ),
    path(
        "shipments/<uuid:shipment_id>/status/",
        AdminShipmentStatusUpdateView.as_view(),
        name="shipment-status-update",
    ),
    path(
        "shipments/<uuid:shipment_id>/dispatch/",
        AdminShipmentDispatchView.as_view(),
        name="shipment-dispatch",
    ),
    path(
        "shipments/<uuid:shipment_id>/receive-back/",
        AdminShipmentReceiveBackView.as_view(),
        name="shipment-receive-back",
    ),
    path(
        "shipments/<uuid:shipment_id>/replace-damaged/",
        AdminShipmentReplaceDamagedView.as_view(),
        name="shipment-replace-damaged",
    ),
    path("returns/", AdminRMAListView.as_view(), name="rma-list"),
    path("returns/<uuid:rma_id>/", AdminRMADetailView.as_view(), name="rma-detail"),
    path(
        "returns/<uuid:rma_id>/approve/",
        AdminRMAActionView.as_view(action="approve"),
        name="rma-approve",
    ),
    path(
        "returns/<uuid:rma_id>/reject/",
        AdminRMAActionView.as_view(action="reject"),
        name="rma-reject",
    ),
    path(
        "returns/<uuid:rma_id>/receive/",
        AdminRMAActionView.as_view(action="receive"),
        name="rma-receive",
    ),
    path(
        "returns/lines/<uuid:rma_line_id>/grade/",
        AdminRMALineGradeView.as_view(),
        name="rma-line-grade",
    ),
]
