from __future__ import annotations

from typing import ClassVar

from django.db import transaction
from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.selectors.addresses import get_address_for_user
from apps.accounts.selectors.users import get_user_by_id
from apps.catalog.selectors.products import get_variant_by_id
from apps.common.exceptions import DomainError
from apps.common.generics import GenericListAPIView
from apps.common.params import get_bool, get_choice, get_date, get_uuid, validate_date_range
from apps.common.pdf import PdfRenderer, pdf_response
from apps.common.permissions import require_any_staff_permission, require_staff_permission
from apps.common.responses import error_from_exception, not_found
from apps.common.serializers import CapturePaymentSerializer
from apps.common.utils.export import CsvRenderer, csv_response
from apps.logistics.selectors.rates import get_carrier_by_id
from apps.orders.models import Payment, ReturnRMA, ReturnRMALine, SalesOrder, StockReservation
from apps.orders.selectors.payments import get_payment_by_id, payments_list
from apps.orders.selectors.reservations import get_reservation_by_id, reservations_list
from apps.orders.selectors.returns import get_rma_by_id, rmas_list
from apps.orders.selectors.sales_orders import (
    get_order_by_id,
    get_order_for_document,
    get_order_line_by_id,
    orders_list,
)
from apps.orders.selectors.shipments import get_shipment_by_id, shipments_list
from apps.orders.services.carts import add_line, create_order
from apps.orders.services.checkout import checkout
from apps.orders.services.exports import export_orders
from apps.orders.services.invoice_document import (
    INVOICE_TEMPLATE,
    build_invoice_context,
    invoice_filename,
)
from apps.orders.services.orders import (
    cancel_order,
    delete_order,
    remove_order_line,
    set_order_status,
    update_order,
    update_order_line,
)
from apps.orders.services.payments import capture_payment, refund_payment
from apps.orders.services.reservations import release_stock_reservation
from apps.orders.services.returns import (
    approve_rma,
    create_rma,
    grade_rma_line,
    receive_rma,
    reject_rma,
)
from apps.orders.services.shipments import (
    create_shipment,
    dispatch_to_courier,
    update_shipment_status,
)

from .serializers import (
    SHIP_TO_API_FIELDS,
    AdminOrderCreateSerializer,
    AdminOrderLineUpdateSerializer,
    AdminOrderStatusSerializer,
    AdminOrderUpdateSerializer,
    AdminPaymentSerializer,
    AdminRMASerializer,
    AdminSalesOrderSerializer,
    CreateRMASerializer,
    CreateShipmentSerializer,
    GradeRMALineSerializer,
    RefundPaymentSerializer,
    ShipmentSerializer,
    ShipmentStatusUpdateSerializer,
    StockReservationSerializer,
)

OrdersViewPermission = require_any_staff_permission(
    StaffPermissionCode.ORDERS_VIEW, StaffPermissionCode.ORDERS_MANAGE
)
OrdersManagePermission = require_staff_permission(StaffPermissionCode.ORDERS_MANAGE)
RefundsApprovePermission = require_staff_permission(StaffPermissionCode.REFUNDS_APPROVE)
ShipmentsViewPermission = require_any_staff_permission(
    StaffPermissionCode.SHIPMENTS_VIEW, StaffPermissionCode.SHIPMENTS_UPDATE
)
ShipmentsUpdatePermission = require_staff_permission(StaffPermissionCode.SHIPMENTS_UPDATE)
ReturnsManagePermission = require_staff_permission(StaffPermissionCode.RETURNS_MANAGE)


class OrdersPermissionMixin:
    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [OrdersViewPermission()]
        return [OrdersManagePermission()]


class OrderQuerysetMixin:
    """Shared so the CSV export cannot drift from what the list endpoint shows."""

    # contact_phone: phone-only guest orders have no customer email to search by.
    search_fields = ("order_number", "customer__email", "contact_phone")
    ordering_fields = ("created_at", "grand_total")
    default_ordering = "-created_at"

    def get_queryset(self):
        params = self.request.query_params
        start = get_date(params, "start")
        end = get_date(params, "end")
        validate_date_range(start, end)
        customer = None
        customer_id = get_uuid(params, "customer_id")
        if customer_id:
            customer = get_user_by_id(customer_id)
        return orders_list(
            customer=customer,
            status=get_choice(params, "status", SalesOrder.Status.values),
            start=start,
            end=end,
        )


@extend_schema(tags=["Orders"])
class AdminOrderListView(OrdersPermissionMixin, OrderQuerysetMixin, GenericListAPIView):
    serializer_class = AdminSalesOrderSerializer

    def get(self, request) -> Response:
        return self.list_response(request)

    def post(self, request) -> Response:
        """Admin-initiated order (phone/manual orders) — build a *dedicated*
        order for the given customer and run it through the same service-layer
        flow as self-service (add lines, check out to reserve stock, then
        capture payment) so it reuses those invariants rather than re-deriving
        totals/reservations here.

        Deliberately not `get_or_create_cart`: that would adopt whatever the
        customer already has sitting in their own cart and bill them for it.
        The whole sequence runs in one transaction so a failure at capture
        can't leave a half-built order holding stock reservations.
        """
        serializer = AdminOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        customer = get_user_by_id(data["customer_id"])
        if customer is None or customer.role != UserRole.CUSTOMER:
            return error_from_exception(
                DomainError("Customer not found.", code="customer_not_found")
            )

        shipping_address = None
        shipping_address_id = data.get("shipping_address_id")
        if shipping_address_id:
            shipping_address = get_address_for_user(customer, shipping_address_id)
            if shipping_address is None:
                return error_from_exception(
                    DomainError(
                        "Shipping address not found for this customer.", code="address_not_found"
                    )
                )

        carrier = None
        carrier_id = data.get("carrier_id")
        if carrier_id:
            carrier = get_carrier_by_id(carrier_id)
            if carrier is None:
                return error_from_exception(
                    DomainError("Carrier not found.", code="carrier_not_found")
                )

        resolved_lines = []
        for line in data["lines"]:
            variant = get_variant_by_id(line["variant_id"])
            if variant is None:
                return error_from_exception(
                    DomainError("Variant not found.", code="variant_not_found")
                )
            resolved_lines.append((variant, line["quantity"]))

        try:
            with transaction.atomic():
                order = create_order(customer=customer, created_by=request.user)
                for variant, quantity in resolved_lines:
                    add_line(order=order, variant=variant, quantity=quantity)
                order = checkout(order=order, shipping_address=shipping_address, carrier=carrier)
                if data.get("capture_payment", True):
                    capture_payment(
                        order=order,
                        amount=order.grand_total,
                        method=data.get("payment_method") or "manual",
                    )
        except DomainError as exc:
            return error_from_exception(exc)

        order = get_order_by_id(order.id)
        return Response(
            {"data": AdminSalesOrderSerializer(order).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Orders"])
class AdminOrderExportView(OrderQuerysetMixin, GenericListAPIView):
    permission_classes: ClassVar[list] = [OrdersViewPermission]
    renderer_classes: ClassVar[list] = [JSONRenderer, CsvRenderer]
    serializer_class = AdminSalesOrderSerializer

    def get(self, request) -> HttpResponse:
        columns, rows = export_orders(self.get_filtered_queryset(request))
        return csv_response("orders.csv", columns, rows)


@extend_schema(tags=["Orders"])
class AdminOrderDetailView(OrdersPermissionMixin, APIView):

    serializer_class = AdminSalesOrderSerializer

    def get(self, request, order_id) -> Response:
        order = get_order_by_id(order_id)
        if order is None:
            return not_found("order_not_found", "Order not found.")
        return Response({"data": AdminSalesOrderSerializer(order).data, "message": "Success"})

    def patch(self, request, order_id) -> Response:
        order = get_order_by_id(order_id)
        if order is None:
            return not_found("order_not_found", "Order not found.")
        serializer = AdminOrderUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        updates: dict = {}
        for field in ("notes", "contact_email", "contact_phone"):
            if field in data:
                updates[field] = data[field]
        for api_name, snapshot_name in SHIP_TO_API_FIELDS.items():
            if api_name in data:
                updates[snapshot_name] = data[api_name]
        if "shipping_address_id" in data:
            address_id = data["shipping_address_id"]
            address = None
            if address_id is not None:
                address = get_address_for_user(order.customer, address_id)
                if address is None:
                    return error_from_exception(
                        DomainError(
                            "Shipping address not found for this customer.",
                            code="address_not_found",
                        )
                    )
            updates["shipping_address"] = address

        try:
            order = update_order(order=order, data=updates, actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": AdminSalesOrderSerializer(order).data, "message": "Success"})

    @extend_schema(responses={204: None})
    def delete(self, request, order_id) -> Response:
        order = get_order_by_id(order_id)
        if order is None:
            return not_found("order_not_found", "Order not found.")
        try:
            delete_order(order=order, actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["Orders"])
class AdminOrderStatusView(APIView):
    """Operator status override. Cancelling routes through `cancel_order`, so
    stock reservations are released rather than stranded."""

    serializer_class = AdminOrderStatusSerializer
    permission_classes: ClassVar[list] = [OrdersManagePermission]

    @extend_schema(request=AdminOrderStatusSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request, order_id) -> Response:
        order = get_order_by_id(order_id)
        if order is None:
            return not_found("order_not_found", "Order not found.")
        serializer = AdminOrderStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            order = set_order_status(
                order=order,
                new_status=serializer.validated_data["status"],
                actor=request.user,
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": AdminSalesOrderSerializer(order).data, "message": "Success"})


@extend_schema(tags=["Orders"])
class AdminOrderLineDetailView(APIView):
    serializer_class = AdminOrderLineUpdateSerializer
    permission_classes: ClassVar[list] = [OrdersManagePermission]

    def _line(self, order_id, line_id):
        line = get_order_line_by_id(line_id)
        if line is None or str(line.order_id) != str(order_id):
            return None
        return line

    @extend_schema(request=AdminOrderLineUpdateSerializer, responses=OpenApiTypes.OBJECT)
    def patch(self, request, order_id, line_id) -> Response:
        line = self._line(order_id, line_id)
        if line is None:
            return not_found("order_line_not_found", "Order line not found.")
        serializer = AdminOrderLineUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            update_order_line(
                line=line, quantity=serializer.validated_data["quantity"], actor=request.user
            )
        except DomainError as exc:
            return error_from_exception(exc)
        order = get_order_by_id(order_id)
        return Response({"data": AdminSalesOrderSerializer(order).data, "message": "Success"})

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def delete(self, request, order_id, line_id) -> Response:
        line = self._line(order_id, line_id)
        if line is None:
            return not_found("order_line_not_found", "Order line not found.")
        try:
            remove_order_line(line=line, actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc)
        order = get_order_by_id(order_id)
        return Response({"data": AdminSalesOrderSerializer(order).data, "message": "Success"})


@extend_schema(tags=["Orders"])
class AdminOrderCancelView(APIView):
    serializer_class = AdminSalesOrderSerializer
    permission_classes: ClassVar[list] = [OrdersManagePermission]

    def post(self, request, order_id) -> Response:
        order = get_order_by_id(order_id)
        if order is None:
            return not_found("order_not_found", "Order not found.")
        try:
            order = cancel_order(order=order, actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": AdminSalesOrderSerializer(order).data, "message": "Success"})


@extend_schema(tags=["Orders"])
class AdminOrderCapturePaymentView(APIView):
    serializer_class = CapturePaymentSerializer
    """Manually capture payment for an order awaiting payment, e.g. a
    phone/manual order paid outside the auto-capture path."""

    permission_classes: ClassVar[list] = [OrdersManagePermission]

    def post(self, request, order_id) -> Response:
        order = get_order_by_id(order_id)
        if order is None:
            return not_found("order_not_found", "Order not found.")
        serializer = CapturePaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            capture_payment(order=order, **serializer.validated_data)
        except DomainError as exc:
            return error_from_exception(exc)
        order.refresh_from_db()
        return Response({"data": AdminSalesOrderSerializer(order).data, "message": "Success"})


@extend_schema(tags=["Orders"])
class AdminPaymentListView(GenericListAPIView):
    permission_classes: ClassVar[list] = [OrdersViewPermission]
    serializer_class = AdminPaymentSerializer
    ordering_fields = ("created_at", "amount")
    default_ordering = "-created_at"

    def get_queryset(self):
        params = self.request.query_params
        start = get_date(params, "start")
        end = get_date(params, "end")
        validate_date_range(start, end)
        return payments_list(
            order=get_uuid(params, "order_id"),
            status=get_choice(params, "status", Payment.Status.values),
            method=params.get("method") or None,
            start=start,
            end=end,
        )

    def get(self, request) -> Response:
        return self.list_response(request)


@extend_schema(tags=["Orders"])
class AdminPaymentDetailView(APIView):
    serializer_class = AdminPaymentSerializer
    permission_classes: ClassVar[list] = [OrdersViewPermission]

    def get(self, request, payment_id) -> Response:
        payment = get_payment_by_id(payment_id)
        if payment is None:
            return not_found("payment_not_found", "Payment not found.")
        return Response({"data": AdminPaymentSerializer(payment).data, "message": "Success"})


@extend_schema(tags=["Orders"])
class AdminReservationListView(GenericListAPIView):
    permission_classes: ClassVar[list] = [OrdersViewPermission]
    serializer_class = StockReservationSerializer
    ordering_fields = ("created_at", "expires_at", "quantity")
    default_ordering = "-created_at"

    def get_queryset(self):
        params = self.request.query_params
        return reservations_list(
            variant=get_uuid(params, "variant_id"),
            order=get_uuid(params, "order_id"),
            status=get_choice(params, "status", StockReservation.Status.values),
            created_before=get_date(params, "created_before"),
            expired=get_bool(params, "expired"),
        )

    def get(self, request) -> Response:
        return self.list_response(request)


@extend_schema(tags=["Orders"])
class AdminReservationDetailView(APIView):
    serializer_class = StockReservationSerializer
    permission_classes: ClassVar[list] = [OrdersViewPermission]

    def get(self, request, reservation_id) -> Response:
        reservation = get_reservation_by_id(reservation_id)
        if reservation is None:
            return not_found("reservation_not_found", "Reservation not found.")
        return Response(
            {"data": StockReservationSerializer(reservation).data, "message": "Success"}
        )


@extend_schema(tags=["Orders"])
class AdminReservationReleaseView(APIView):
    serializer_class = StockReservationSerializer
    permission_classes: ClassVar[list] = [OrdersManagePermission]

    def post(self, request, reservation_id) -> Response:
        reservation = get_reservation_by_id(reservation_id)
        if reservation is None:
            return not_found("reservation_not_found", "Reservation not found.")
        try:
            reservation = release_stock_reservation(reservation=reservation, actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": StockReservationSerializer(reservation).data, "message": "Success"}
        )


@extend_schema(tags=["Orders"])
class AdminPaymentRefundView(APIView):
    serializer_class = RefundPaymentSerializer
    permission_classes: ClassVar[list] = [RefundsApprovePermission]

    def post(self, request, payment_id) -> Response:
        payment = get_payment_by_id(payment_id)
        if payment is None:
            return not_found("payment_not_found", "Payment not found.")
        serializer = RefundPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payment = refund_payment(
                payment=payment,
                amount=serializer.validated_data.get("amount"),
                actor=request.user,
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": AdminPaymentSerializer(payment).data, "message": "Success"})


@extend_schema(tags=["Orders"])
class AdminShipmentListCreateView(GenericListAPIView):
    permission_classes: ClassVar[list] = [ShipmentsViewPermission]
    serializer_class = ShipmentSerializer
    search_fields = ("tracking_number", "order__order_number", "carrier__name")
    ordering_fields = ("created_at",)
    default_ordering = "-created_at"

    def get_queryset(self):
        return shipments_list()

    def get(self, request) -> Response:
        return self.list_response(request)


@extend_schema(tags=["Orders"])
class AdminOrderShipmentCreateView(APIView):
    serializer_class = ShipmentSerializer
    permission_classes: ClassVar[list] = [ShipmentsUpdatePermission]

    def post(self, request, order_id) -> Response:
        order = get_order_by_id(order_id)
        if order is None:
            return not_found("order_not_found", "Order not found.")
        serializer = CreateShipmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        carrier_id = data.pop("carrier_id", None)
        carrier = get_carrier_by_id(carrier_id) if carrier_id else None
        if carrier_id and carrier is None:
            return error_from_exception(DomainError("Carrier not found.", code="carrier_not_found"))

        order_lines_by_id = {str(line.id): line for line in order.lines.all()}
        lines = []
        for line in data.pop("lines"):
            order_line = order_lines_by_id.get(str(line["order_line_id"]))
            if order_line is None:
                return error_from_exception(
                    DomainError("Order line not found.", code="order_line_not_found")
                )
            lines.append({"order_line": order_line, "quantity": line["quantity"]})

        try:
            shipment = create_shipment(order=order, lines=lines, carrier=carrier, **data)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": ShipmentSerializer(shipment).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Orders"])
class AdminShipmentDetailView(APIView):
    serializer_class = ShipmentSerializer
    permission_classes: ClassVar[list] = [ShipmentsViewPermission]

    def get(self, request, shipment_id) -> Response:
        shipment = get_shipment_by_id(shipment_id)
        if shipment is None:
            return not_found("shipment_not_found", "Shipment not found.")
        return Response({"data": ShipmentSerializer(shipment).data, "message": "Success"})


@extend_schema(tags=["Orders"])
class AdminShipmentStatusUpdateView(APIView):
    serializer_class = ShipmentSerializer
    permission_classes: ClassVar[list] = [ShipmentsUpdatePermission]

    def patch(self, request, shipment_id) -> Response:
        shipment = get_shipment_by_id(shipment_id)
        if shipment is None:
            return not_found("shipment_not_found", "Shipment not found.")
        serializer = ShipmentStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            shipment = update_shipment_status(
                shipment=shipment, status=serializer.validated_data["status"], actor=request.user
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": ShipmentSerializer(shipment).data, "message": "Success"})


@extend_schema(tags=["Orders"])
class AdminShipmentDispatchView(APIView):
    serializer_class = ShipmentSerializer
    permission_classes: ClassVar[list] = [ShipmentsUpdatePermission]

    def post(self, request, shipment_id) -> Response:
        shipment = get_shipment_by_id(shipment_id)
        if shipment is None:
            return not_found("shipment_not_found", "Shipment not found.")
        try:
            shipment = dispatch_to_courier(shipment=shipment)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": ShipmentSerializer(shipment).data, "message": "Success"})


@extend_schema(tags=["Orders"])
class AdminRMAListView(GenericListAPIView):
    permission_classes: ClassVar[list] = [ReturnsManagePermission]
    serializer_class = AdminRMASerializer
    search_fields = ("rma_number",)
    ordering_fields = ("created_at",)
    default_ordering = "-created_at"

    def get_queryset(self):
        status_param = get_choice(self.request.query_params, "status", ReturnRMA.Status.values)
        return rmas_list(status=status_param)

    def get(self, request) -> Response:
        return self.list_response(request)


@extend_schema(tags=["Orders"])
class AdminOrderRMACreateView(APIView):
    serializer_class = AdminRMASerializer
    """Staff-initiated return, e.g. from a phone request, mirroring the
    customer-facing RMA creation flow."""

    permission_classes: ClassVar[list] = [ReturnsManagePermission]

    def post(self, request, order_id) -> Response:
        order = get_order_by_id(order_id)
        if order is None:
            return not_found("order_not_found", "Order not found.")
        serializer = CreateRMASerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        order_lines_by_id = {str(line.id): line for line in order.lines.all()}
        lines = []
        for line in data.pop("lines"):
            order_line = order_lines_by_id.get(str(line["order_line_id"]))
            if order_line is None:
                return error_from_exception(
                    DomainError("Order line not found.", code="order_line_not_found")
                )
            lines.append({"order_line": order_line, "quantity": line["quantity"]})

        try:
            rma = create_rma(order=order, lines=lines, **data)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": AdminRMASerializer(rma).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Orders"])
class AdminRMADetailView(APIView):
    serializer_class = AdminRMASerializer
    permission_classes: ClassVar[list] = [ReturnsManagePermission]

    def get(self, request, rma_id) -> Response:
        rma = get_rma_by_id(rma_id)
        if rma is None:
            return not_found("rma_not_found", "RMA not found.")
        return Response({"data": AdminRMASerializer(rma).data, "message": "Success"})


@extend_schema(tags=["Orders"])
class AdminRMAActionView(APIView):
    serializer_class = AdminRMASerializer
    permission_classes: ClassVar[list] = [ReturnsManagePermission]
    action = ""

    def post(self, request, rma_id) -> Response:
        rma = get_rma_by_id(rma_id)
        if rma is None:
            return not_found("rma_not_found", "RMA not found.")
        try:
            if self.action == "approve":
                rma = approve_rma(rma=rma)
            elif self.action == "reject":
                rma = reject_rma(rma=rma)
            elif self.action == "receive":
                rma = receive_rma(rma=rma, actor=request.user)
            else:
                return not_found("unknown_action", "Unknown action.")
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": AdminRMASerializer(rma).data, "message": "Success"})


@extend_schema(tags=["Orders"])
class AdminRMALineGradeView(APIView):
    serializer_class = GradeRMALineSerializer
    permission_classes: ClassVar[list] = [ReturnsManagePermission]

    def patch(self, request, rma_line_id) -> Response:
        line = ReturnRMALine.objects.filter(id=rma_line_id).select_related("rma").first()
        if line is None:
            return not_found("rma_line_not_found", "RMA line not found.")
        serializer = GradeRMALineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            line = grade_rma_line(line=line, **serializer.validated_data)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": AdminRMASerializer(line.rma).data, "message": "Success"})


@extend_schema(tags=["Orders"])
class AdminOrderInvoicePdfView(APIView):
    permission_classes: ClassVar[list] = [OrdersViewPermission]
    renderer_classes: ClassVar[list] = [PdfRenderer]

    @extend_schema(request=None, responses={(200, "application/pdf"): OpenApiTypes.BINARY})
    def get(self, request, order_id):
        order = get_order_for_document(order_id)
        if order is None:
            return not_found("order_not_found", "Order not found.")
        return pdf_response(
            filename=invoice_filename(order),
            template_name=INVOICE_TEMPLATE,
            context=build_invoice_context(order),
        )
