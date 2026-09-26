from __future__ import annotations

from typing import ClassVar

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import StaffPermissionCode
from apps.catalog.selectors.products import get_variant_by_id
from apps.common.exception_handler import status_for_code
from apps.common.exceptions import DomainError
from apps.common.generics import GenericListAPIView, IncludeDeletedMixin, RestoreAPIView
from apps.common.params import get_choice, get_date, get_uuid, validate_date_range
from apps.common.pdf import PdfRenderer, pdf_response
from apps.common.permissions import require_any_staff_permission, require_staff_permission
from apps.common.responses import error_from_exception, not_found
from apps.common.services.soft_delete import soft_delete_instance
from apps.procurement.models import PurchaseOrder, VendorBill
from apps.procurement.selectors.goods_receipts import get_goods_receipt_by_id, goods_receipts_list
from apps.procurement.selectors.purchase_orders import (
    get_purchase_order_by_id,
    get_purchase_order_for_document,
    get_purchase_order_line,
    purchase_orders_list,
)
from apps.procurement.selectors.suppliers import get_supplier_by_id, suppliers_list
from apps.procurement.selectors.vendor_bills import (
    get_vendor_bill_by_id,
    get_vendor_bill_for_document,
    vendor_bills_list,
)
from apps.procurement.selectors.vendor_payments import (
    get_vendor_payment_by_id,
    vendor_payments_list,
)
from apps.procurement.services.goods_receipt import create_goods_receipt
from apps.procurement.services.purchase_order_document import (
    PURCHASE_ORDER_TEMPLATE,
    build_purchase_order_context,
    purchase_order_filename,
)
from apps.procurement.services.purchase_orders import (
    add_purchase_order_line,
    cancel_purchase_order,
    create_purchase_order,
    delete_purchase_order,
    remove_purchase_order_line,
    submit_purchase_order,
    update_purchase_order,
    update_purchase_order_line,
)
from apps.procurement.services.suppliers import create_supplier, update_supplier
from apps.procurement.services.vendor_bill_document import (
    VENDOR_BILL_TEMPLATE,
    build_vendor_bill_context,
    vendor_bill_filename,
)
from apps.procurement.services.vendor_bills import (
    create_vendor_bill,
    record_vendor_payment,
    update_vendor_bill,
    void_vendor_bill,
)

from .serializers import (
    GoodsReceiptCreateSerializer,
    GoodsReceiptNoteSerializer,
    PurchaseOrderCreateSerializer,
    PurchaseOrderLineInputSerializer,
    PurchaseOrderLineSerializer,
    PurchaseOrderLineUpdateSerializer,
    PurchaseOrderSerializer,
    PurchaseOrderUpdateSerializer,
    SupplierCreateSerializer,
    SupplierSerializer,
    SupplierUpdateSerializer,
    VendorBillCreateSerializer,
    VendorBillSerializer,
    VendorBillUpdateSerializer,
    VendorPaymentCreateSerializer,
    VendorPaymentSerializer,
)

PurchasingViewPermission = require_any_staff_permission(
    StaffPermissionCode.PURCHASING_VIEW, StaffPermissionCode.PURCHASING_MANAGE
)
PurchasingManagePermission = require_staff_permission(StaffPermissionCode.PURCHASING_MANAGE)
VendorBillViewPermission = require_any_staff_permission(
    StaffPermissionCode.ACCOUNTING_VIEW,
    StaffPermissionCode.ACCOUNTING_POST,
    StaffPermissionCode.INVOICES_MANAGE,
)
VendorBillWritePermission = require_any_staff_permission(
    StaffPermissionCode.ACCOUNTING_POST, StaffPermissionCode.INVOICES_MANAGE
)


class PurchasingPermissionMixin:
    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [PurchasingViewPermission()]
        return [PurchasingManagePermission()]


class VendorBillPermissionMixin:
    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [VendorBillViewPermission()]
        return [VendorBillWritePermission()]


@extend_schema(tags=["Procurement"])
class AdminSupplierListCreateView(
    IncludeDeletedMixin, PurchasingPermissionMixin, GenericListAPIView
):
    include_deleted_permission = PurchasingManagePermission
    serializer_class = SupplierSerializer
    search_fields = ("name", "contact_email")
    ordering_fields = ("name", "created_at")
    default_ordering = "name"

    def get_queryset(self):
        return suppliers_list(include_deleted=self.include_deleted())

    def get(self, request) -> Response:
        return self.list_response(request)

    def post(self, request) -> Response:
        serializer = SupplierCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        supplier = create_supplier(**serializer.validated_data)
        return Response(
            {"data": SupplierSerializer(supplier).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Procurement"])
class AdminSupplierDetailView(PurchasingPermissionMixin, APIView):
    serializer_class = SupplierSerializer

    def get(self, request, supplier_id) -> Response:
        supplier = get_supplier_by_id(supplier_id)
        if supplier is None:
            return not_found("supplier_not_found", "Supplier not found.")
        return Response({"data": SupplierSerializer(supplier).data, "message": "Success"})

    def patch(self, request, supplier_id) -> Response:
        supplier = get_supplier_by_id(supplier_id)
        if supplier is None:
            return not_found("supplier_not_found", "Supplier not found.")
        serializer = SupplierUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        supplier = update_supplier(supplier=supplier, data=dict(serializer.validated_data))
        return Response({"data": SupplierSerializer(supplier).data, "message": "Success"})

    def delete(self, request, supplier_id) -> Response:
        supplier = get_supplier_by_id(supplier_id)
        if supplier is None:
            return not_found("supplier_not_found", "Supplier not found.")
        try:
            soft_delete_instance(
                supplier,
                actor=request.user,
                protected_relations=("purchase_orders", "vendor_bills"),
                code="supplier_in_use",
            )
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["Procurement"])
class AdminSupplierRestoreView(RestoreAPIView):
    permission_classes: ClassVar[list] = [PurchasingManagePermission]
    get_object_fn = staticmethod(get_supplier_by_id)
    serializer_class = SupplierSerializer
    not_found_code = "supplier_not_found"
    not_found_message = "Supplier not found."


@extend_schema(tags=["Procurement"])
class AdminPurchaseOrderListCreateView(PurchasingPermissionMixin, GenericListAPIView):
    serializer_class = PurchaseOrderSerializer
    search_fields = ("po_number",)
    ordering_fields = ("order_date", "created_at")
    default_ordering = "-order_date"

    def get_queryset(self):
        status_param = get_choice(self.request.query_params, "status", PurchaseOrder.Status.values)
        return purchase_orders_list(status=status_param)

    def get(self, request) -> Response:
        return self.list_response(request)

    def post(self, request) -> Response:
        serializer = PurchaseOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        supplier = get_supplier_by_id(data.pop("supplier_id"))
        if supplier is None:
            return error_from_exception(
                DomainError("Supplier not found.", code="supplier_not_found")
            )
        lines = []
        for line in data.pop("lines"):
            variant = get_variant_by_id(line["variant_id"])
            if variant is None:
                return error_from_exception(
                    DomainError("Variant not found.", code="variant_not_found")
                )
            lines.append(
                {
                    "variant": variant,
                    "quantity_ordered": line["quantity_ordered"],
                    "unit_cost": line["unit_cost"],
                }
            )

        try:
            purchase_order = create_purchase_order(supplier=supplier, lines=lines, **data)
        except DomainError as exc:
            return error_from_exception(exc)
        full_po = get_purchase_order_by_id(purchase_order.id) or purchase_order
        return Response(
            {"data": PurchaseOrderSerializer(full_po).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Procurement"])
class AdminPurchaseOrderDetailView(PurchasingPermissionMixin, APIView):
    serializer_class = PurchaseOrderSerializer

    def get(self, request, po_id) -> Response:
        purchase_order = get_purchase_order_by_id(po_id)
        if purchase_order is None:
            return not_found("po_not_found", "Purchase order not found.")
        return Response(
            {"data": PurchaseOrderSerializer(purchase_order).data, "message": "Success"}
        )

    def patch(self, request, po_id) -> Response:
        purchase_order = get_purchase_order_by_id(po_id)
        if purchase_order is None:
            return not_found("po_not_found", "Purchase order not found.")
        serializer = PurchaseOrderUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        if "supplier_id" in data:
            supplier = get_supplier_by_id(data.pop("supplier_id"))
            if supplier is None:
                return error_from_exception(
                    DomainError("Supplier not found.", code="supplier_not_found"),
                    status.HTTP_404_NOT_FOUND,
                )
            data["supplier"] = supplier

        try:
            purchase_order = update_purchase_order(purchase_order=purchase_order, data=data)
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response(
            {"data": PurchaseOrderSerializer(purchase_order).data, "message": "Success"}
        )

    def delete(self, request, po_id) -> Response:
        purchase_order = get_purchase_order_by_id(po_id)
        if purchase_order is None:
            return not_found("po_not_found", "Purchase order not found.")
        try:
            delete_purchase_order(purchase_order=purchase_order, actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["Procurement"])
class AdminPurchaseOrderLineCreateView(PurchasingPermissionMixin, APIView):
    serializer_class = PurchaseOrderLineInputSerializer

    def post(self, request, po_id) -> Response:
        purchase_order = get_purchase_order_by_id(po_id)
        if purchase_order is None:
            return not_found("po_not_found", "Purchase order not found.")
        serializer = PurchaseOrderLineInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        variant = get_variant_by_id(data.pop("variant_id"))
        if variant is None:
            return error_from_exception(
                DomainError("Variant not found.", code="variant_not_found"),
                status.HTTP_404_NOT_FOUND,
            )

        try:
            line = add_purchase_order_line(purchase_order=purchase_order, variant=variant, **data)
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response(
            {"data": PurchaseOrderLineSerializer(line).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Procurement"])
class AdminPurchaseOrderLineDetailView(PurchasingPermissionMixin, APIView):
    serializer_class = PurchaseOrderLineSerializer

    def _get_line(self, po_id, line_id):
        purchase_order = get_purchase_order_by_id(po_id)
        if purchase_order is None:
            return None, None
        return purchase_order, get_purchase_order_line(purchase_order, line_id)

    def patch(self, request, po_id, line_id) -> Response:
        purchase_order, line = self._get_line(po_id, line_id)
        if purchase_order is None:
            return not_found("po_not_found", "Purchase order not found.")
        if line is None:
            return not_found("po_line_not_found", "Purchase order line not found.")
        serializer = PurchaseOrderLineUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        if "variant_id" in data:
            variant = get_variant_by_id(data.pop("variant_id"))
            if variant is None:
                return error_from_exception(
                    DomainError("Variant not found.", code="variant_not_found"),
                    status.HTTP_404_NOT_FOUND,
                )
            data["variant"] = variant

        try:
            line = update_purchase_order_line(purchase_order=purchase_order, line=line, data=data)
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response({"data": PurchaseOrderLineSerializer(line).data, "message": "Success"})

    def delete(self, request, po_id, line_id) -> Response:
        purchase_order, line = self._get_line(po_id, line_id)
        if purchase_order is None:
            return not_found("po_not_found", "Purchase order not found.")
        if line is None:
            return not_found("po_line_not_found", "Purchase order line not found.")
        try:
            remove_purchase_order_line(purchase_order=purchase_order, line=line)
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["Procurement"])
class AdminPurchaseOrderSubmitView(APIView):
    serializer_class = PurchaseOrderSerializer
    permission_classes: ClassVar[list] = [PurchasingManagePermission]

    def post(self, request, po_id) -> Response:
        purchase_order = get_purchase_order_by_id(po_id)
        if purchase_order is None:
            return not_found("po_not_found", "Purchase order not found.")
        try:
            purchase_order = submit_purchase_order(purchase_order=purchase_order)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": PurchaseOrderSerializer(purchase_order).data, "message": "Success"}
        )


@extend_schema(tags=["Procurement"])
class AdminPurchaseOrderCancelView(APIView):
    serializer_class = PurchaseOrderSerializer
    permission_classes: ClassVar[list] = [PurchasingManagePermission]

    def post(self, request, po_id) -> Response:
        purchase_order = get_purchase_order_by_id(po_id)
        if purchase_order is None:
            return not_found("po_not_found", "Purchase order not found.")
        try:
            purchase_order = cancel_purchase_order(purchase_order=purchase_order)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": PurchaseOrderSerializer(purchase_order).data, "message": "Success"}
        )


@extend_schema(tags=["Procurement"])
class AdminGoodsReceiptListCreateView(PurchasingPermissionMixin, GenericListAPIView):
    serializer_class = GoodsReceiptNoteSerializer
    search_fields = (
        "purchase_order__po_number",
        "purchase_order__supplier__name",
    )
    ordering_fields = ("received_date",)
    default_ordering = "-received_date"

    def get_queryset(self):
        return goods_receipts_list()

    def get(self, request) -> Response:
        return self.list_response(request)

    def post(self, request) -> Response:
        serializer = GoodsReceiptCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        purchase_order = get_purchase_order_by_id(data.pop("purchase_order_id"))
        if purchase_order is None:
            return error_from_exception(
                DomainError("Purchase order not found.", code="po_not_found")
            )
        po_lines_by_id = {str(line.id): line for line in purchase_order.lines.all()}
        lines = []
        for line in data.pop("lines"):
            po_line = po_lines_by_id.get(str(line["purchase_order_line_id"]))
            if po_line is None:
                return error_from_exception(
                    DomainError("Purchase order line not found.", code="po_line_not_found")
                )
            lines.append(
                {
                    "purchase_order_line": po_line,
                    "quantity_received": line["quantity_received"],
                    "condition": line["condition"],
                }
            )

        try:
            grn = create_goods_receipt(
                purchase_order=purchase_order,
                received_by=request.user,
                lines=lines,
                **data,
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": GoodsReceiptNoteSerializer(grn).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Procurement"])
class AdminGoodsReceiptDetailView(APIView):
    serializer_class = GoodsReceiptNoteSerializer
    permission_classes: ClassVar[list] = [PurchasingViewPermission]

    def get(self, request, grn_id) -> Response:
        grn = get_goods_receipt_by_id(grn_id)
        if grn is None:
            return not_found("goods_receipt_not_found", "Goods receipt not found.")
        return Response({"data": GoodsReceiptNoteSerializer(grn).data, "message": "Success"})


@extend_schema(tags=["Procurement"])
class AdminVendorBillListCreateView(VendorBillPermissionMixin, GenericListAPIView):
    serializer_class = VendorBillSerializer
    search_fields = ("bill_number",)
    ordering_fields = ("due_date", "created_at")
    default_ordering = "-due_date"

    def get_queryset(self):
        status_param = get_choice(self.request.query_params, "status", VendorBill.Status.values)
        return vendor_bills_list(status=status_param)

    def get(self, request) -> Response:
        return self.list_response(request)

    def post(self, request) -> Response:
        serializer = VendorBillCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        purchase_order = get_purchase_order_by_id(data.pop("purchase_order_id"))
        if purchase_order is None:
            return error_from_exception(
                DomainError("Purchase order not found.", code="po_not_found")
            )
        supplier = get_supplier_by_id(data.pop("supplier_id"))
        if supplier is None:
            return error_from_exception(
                DomainError("Supplier not found.", code="supplier_not_found")
            )

        try:
            bill = create_vendor_bill(purchase_order=purchase_order, supplier=supplier, **data)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": VendorBillSerializer(bill).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Procurement"])
class AdminVendorBillDetailView(VendorBillPermissionMixin, APIView):
    serializer_class = VendorBillSerializer

    def get(self, request, bill_id) -> Response:
        bill = get_vendor_bill_by_id(bill_id)
        if bill is None:
            return not_found("vendor_bill_not_found", "Vendor bill not found.")
        return Response({"data": VendorBillSerializer(bill).data, "message": "Success"})

    def patch(self, request, bill_id) -> Response:
        bill = get_vendor_bill_by_id(bill_id)
        if bill is None:
            return not_found("vendor_bill_not_found", "Vendor bill not found.")
        serializer = VendorBillUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            bill = update_vendor_bill(vendor_bill=bill, data=dict(serializer.validated_data))
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response({"data": VendorBillSerializer(bill).data, "message": "Success"})


@extend_schema(tags=["Procurement"])
class AdminVendorBillVoidView(APIView):
    serializer_class = VendorBillSerializer
    permission_classes: ClassVar[list] = [VendorBillWritePermission]

    def post(self, request, bill_id) -> Response:
        bill = get_vendor_bill_by_id(bill_id)
        if bill is None:
            return not_found("vendor_bill_not_found", "Vendor bill not found.")
        try:
            bill = void_vendor_bill(vendor_bill=bill)
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response({"data": VendorBillSerializer(bill).data, "message": "Success"})


@extend_schema(tags=["Procurement"])
class AdminVendorPaymentListView(GenericListAPIView):
    permission_classes: ClassVar[list] = [VendorBillViewPermission]
    serializer_class = VendorPaymentSerializer
    ordering_fields = ("paid_at", "amount")
    default_ordering = "-paid_at"

    def get_queryset(self):
        params = self.request.query_params
        start = get_date(params, "start")
        end = get_date(params, "end")
        validate_date_range(start, end)
        return vendor_payments_list(
            vendor_bill_id=get_uuid(params, "vendor_bill_id"),
            method=params.get("method") or None,
            start=start,
            end=end,
        )

    def get(self, request) -> Response:
        return self.list_response(request)


@extend_schema(tags=["Procurement"])
class AdminVendorPaymentDetailView(APIView):
    serializer_class = VendorPaymentSerializer
    permission_classes: ClassVar[list] = [VendorBillViewPermission]

    def get(self, request, payment_id) -> Response:
        payment = get_vendor_payment_by_id(payment_id)
        if payment is None:
            return not_found("vendor_payment_not_found", "Vendor payment not found.")
        return Response({"data": VendorPaymentSerializer(payment).data, "message": "Success"})


@extend_schema(tags=["Procurement"])
class AdminVendorPaymentView(APIView):
    serializer_class = VendorPaymentSerializer
    permission_classes: ClassVar[list] = [VendorBillWritePermission]

    def post(self, request, bill_id) -> Response:
        bill = get_vendor_bill_by_id(bill_id)
        if bill is None:
            return not_found("vendor_bill_not_found", "Vendor bill not found.")
        serializer = VendorPaymentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payment = record_vendor_payment(vendor_bill=bill, **serializer.validated_data)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": VendorPaymentSerializer(payment).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Procurement"])
class AdminPurchaseOrderPdfView(APIView):
    permission_classes: ClassVar[list] = [PurchasingViewPermission]
    renderer_classes: ClassVar[list] = [PdfRenderer]

    @extend_schema(request=None, responses={(200, "application/pdf"): OpenApiTypes.BINARY})
    def get(self, request, po_id):
        purchase_order = get_purchase_order_for_document(po_id)
        if purchase_order is None:
            return not_found("po_not_found", "Purchase order not found.")
        return pdf_response(
            filename=purchase_order_filename(purchase_order),
            template_name=PURCHASE_ORDER_TEMPLATE,
            context=build_purchase_order_context(purchase_order),
        )


@extend_schema(tags=["Procurement"])
class AdminVendorBillPdfView(APIView):
    permission_classes: ClassVar[list] = [VendorBillViewPermission]
    renderer_classes: ClassVar[list] = [PdfRenderer]

    @extend_schema(request=None, responses={(200, "application/pdf"): OpenApiTypes.BINARY})
    def get(self, request, bill_id):
        bill = get_vendor_bill_for_document(bill_id)
        if bill is None:
            return not_found("vendor_bill_not_found", "Vendor bill not found.")
        return pdf_response(
            filename=vendor_bill_filename(bill),
            template_name=VENDOR_BILL_TEMPLATE,
            context=build_vendor_bill_context(bill),
        )
