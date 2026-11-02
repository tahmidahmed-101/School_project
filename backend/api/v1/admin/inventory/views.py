from __future__ import annotations

from typing import ClassVar

from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import StaffPermissionCode
from apps.catalog.selectors.categories import get_category_by_id
from apps.catalog.selectors.products import (
    get_variant_by_id,
    get_variant_by_sku_or_barcode,
)
from apps.catalog.services.products import create_quick_product
from apps.common.exception_handler import status_for_code
from apps.common.exceptions import DomainError
from apps.common.generics import GenericListAPIView
from apps.common.params import get_bool, get_choice, get_kind, get_related, get_uuid
from apps.common.permissions import require_any_staff_permission, require_staff_permission
from apps.common.responses import error_from_exception, not_found
from apps.common.utils.export import CsvRenderer, csv_response
from apps.inventory.constants import MovementType
from apps.inventory.selectors.stock import (
    available_quantities_for_variants,
    get_stock_item_by_id,
    ledger_entries_list,
    stock_items_list,
)
from apps.inventory.selectors.stock_status import stock_status_summary
from apps.inventory.selectors.transfers import get_transfer_by_id, transfers_list
from apps.inventory.selectors.warehouse import (
    all_warehouses,
    get_warehouse_by_id,
)
from apps.inventory.services.exports import LEDGER_EXPORT_COLUMNS, export_ledger_entries
from apps.inventory.services.stock import (
    delete_stock_item,
    post_adjustment,
    post_bulk_adjustments,
    stock_intake,
    write_off_stock,
)
from apps.inventory.services.transfers import transfer_stock
from apps.inventory.services.warehouses import (
    create_warehouse,
    delete_warehouse,
    update_warehouse,
)

from .serializers import (
    BulkStockAdjustmentSerializer,
    QuickProductCreateSerializer,
    StockAdjustmentSerializer,
    StockIntakeSerializer,
    StockItemSerializer,
    StockLedgerEntrySerializer,
    StockLookupVariantSerializer,
    StockTransferCreateSerializer,
    StockTransferSerializer,
    StockWriteOffSerializer,
    WarehouseCreateSerializer,
    WarehouseSerializer,
    WarehouseUpdateSerializer,
)

InventoryViewPermission = require_any_staff_permission(
    StaffPermissionCode.INVENTORY_VIEW, StaffPermissionCode.INVENTORY_MANAGE
)
InventoryManagePermission = require_staff_permission(StaffPermissionCode.INVENTORY_MANAGE)


class InventoryPermissionMixin:
    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [InventoryViewPermission()]
        return [InventoryManagePermission()]


InventoryAdjustPermission = require_any_staff_permission(
    StaffPermissionCode.INVENTORY_ADJUST, StaffPermissionCode.INVENTORY_MANAGE
)
StockAppCreatePermission = require_any_staff_permission(
    StaffPermissionCode.CATALOG_MANAGE, StaffPermissionCode.INVENTORY_MANAGE
)


@extend_schema(tags=["Inventory"])
class AdminStockItemListView(GenericListAPIView):
    permission_classes: ClassVar[list] = [InventoryViewPermission]
    serializer_class = StockItemSerializer
    search_fields = (
        "variant__sku",
        "variant__barcode",
        "variant__product__name",
    )
    product_code_field = "variant__product__product_code"
    ordering_fields = ("quantity_on_hand", "created_at")
    default_ordering = "-created_at"

    def get_queryset(self):
        params = self.request.query_params
        variant = get_related(params, "variant_id", get_variant_by_id, "Variant not found.")
        warehouse = get_related(params, "warehouse_id", get_warehouse_by_id, "Warehouse not found.")
        low_stock_only = get_bool(params, "low_stock_only", default=False)
        # Read-only: new items get their empty record when they are created,
        # so a record staff delete is not put back by the next page load.
        return stock_items_list(
            variant=variant,
            product=get_uuid(params, "product_id"),
            warehouse=warehouse,
            low_stock_only=low_stock_only,
            kind=get_kind(params),
        )

    def get(self, request) -> Response:
        return self.list_response(request)


@extend_schema(tags=["Inventory"])
class AdminStockItemDetailView(InventoryPermissionMixin, APIView):
    serializer_class = StockItemSerializer

    def get(self, request, stock_item_id) -> Response:
        stock_item = get_stock_item_by_id(stock_item_id)
        if stock_item is None:
            return not_found("stock_item_not_found", "Stock item not found.")
        return Response({"data": StockItemSerializer(stock_item).data, "message": "Success"})

    def delete(self, request, stock_item_id) -> Response:
        stock_item = get_stock_item_by_id(stock_item_id)
        if stock_item is None:
            return not_found("stock_item_not_found", "Stock item not found.")
        try:
            delete_stock_item(stock_item=stock_item, actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        return Response({"data": {}, "message": "Success"})


def _filtered_ledger_entries(params):
    variant = get_related(params, "variant_id", get_variant_by_id, "Variant not found.")
    warehouse = get_related(params, "warehouse_id", get_warehouse_by_id, "Warehouse not found.")
    movement_type = get_choice(params, "movement_type", MovementType.values)
    return ledger_entries_list(
        variant=variant, warehouse=warehouse, movement_type=movement_type, kind=get_kind(params)
    )


class LedgerQuerysetMixin:
    """Shared so the CSV export cannot drift from what the list endpoint shows."""

    search_fields = ("variant__sku", "variant__product__name", "notes")
    product_code_field = "variant__product__product_code"
    ordering_fields = ("created_at",)
    default_ordering = "-created_at"

    def get_queryset(self):
        return _filtered_ledger_entries(self.request.query_params)


@extend_schema(tags=["Inventory"])
class AdminStockLedgerEntryListView(LedgerQuerysetMixin, GenericListAPIView):
    permission_classes: ClassVar[list] = [InventoryViewPermission]
    serializer_class = StockLedgerEntrySerializer

    def get(self, request) -> Response:
        return self.list_response(request)


@extend_schema(tags=["Inventory"])
class AdminStockLedgerEntryExportView(LedgerQuerysetMixin, GenericListAPIView):
    permission_classes: ClassVar[list] = [InventoryViewPermission]
    renderer_classes: ClassVar[list] = [JSONRenderer, CsvRenderer]
    serializer_class = StockLedgerEntrySerializer

    def get(self, request) -> HttpResponse:
        return csv_response(
            "stock-ledger.csv",
            LEDGER_EXPORT_COLUMNS,
            export_ledger_entries(self.get_filtered_queryset(request)),
        )


@extend_schema(tags=["Inventory"])
class AdminStockAdjustmentView(APIView):
    serializer_class = StockAdjustmentSerializer
    permission_classes: ClassVar[list] = [InventoryAdjustPermission]

    def post(self, request) -> Response:
        serializer = StockAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        variant = get_variant_by_id(data.pop("variant_id"))
        if variant is None:
            return error_from_exception(DomainError("Variant not found.", code="variant_not_found"))

        data["warehouse"] = data.pop("warehouse_id", None)

        try:
            entry = post_adjustment(variant=variant, actor=request.user, **data)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": StockLedgerEntrySerializer(entry).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Inventory"])
class AdminBulkStockAdjustmentView(APIView):
    serializer_class = BulkStockAdjustmentSerializer
    """All-or-nothing: the whole batch is rolled back if any item fails, so a
    cycle count is never left half-applied."""

    permission_classes: ClassVar[list] = [InventoryAdjustPermission]

    def post(self, request) -> Response:
        serializer = BulkStockAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        items = [dict(item) for item in serializer.validated_data["adjustments"]]
        kind = serializer.validated_data.get("kind")

        try:
            results = post_bulk_adjustments(items=items, actor=request.user, kind=kind)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {
                "data": {
                    "results": [
                        {
                            "index": result["index"],
                            "entry": StockLedgerEntrySerializer(result["entry"]).data,
                        }
                        for result in results
                    ],
                    "count": len(results),
                },
                "message": "Success",
            },
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Inventory"])
class AdminStockWriteOffView(APIView):
    serializer_class = StockWriteOffSerializer
    permission_classes: ClassVar[list] = [InventoryAdjustPermission]

    def post(self, request) -> Response:
        serializer = StockWriteOffSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        variant = get_variant_by_id(data.pop("variant_id"))
        if variant is None:
            return error_from_exception(DomainError("Variant not found.", code="variant_not_found"))

        data["warehouse"] = data.pop("warehouse_id", None)

        try:
            entry = write_off_stock(variant=variant, actor=request.user, **data)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": StockLedgerEntrySerializer(entry).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Inventory"])
class AdminStockStatusView(APIView):
    permission_classes: ClassVar[list] = [InventoryViewPermission]

    @extend_schema(request=None, responses=OpenApiTypes.OBJECT)
    def get(self, request) -> Response:
        summary = stock_status_summary(kind=get_kind(request.query_params))
        return Response({"data": summary, "message": "Success"})


@extend_schema(tags=["Inventory"])
class AdminStockLookupView(APIView):
    serializer_class = StockLookupVariantSerializer
    """Stock App existence check: `?q=<sku-or-barcode>` returns the variant
    with its available quantity, or `{"found": false}`."""

    permission_classes: ClassVar[list] = [InventoryViewPermission]

    def get(self, request) -> Response:
        identifier = (request.query_params.get("q") or "").strip()
        if not identifier:
            return error_from_exception(
                DomainError("Provide a SKU or barcode to look up.", code="missing_query")
            )
        kind = get_kind(request.query_params)
        variant = get_variant_by_sku_or_barcode(identifier)
        if variant is not None and kind and variant.product.category.category_type != kind:
            variant = None
        if variant is None:
            return Response({"data": {"found": False, "query": identifier}, "message": "Success"})
        data = StockLookupVariantSerializer(
            variant,
            context={"available_by_variant": available_quantities_for_variants([variant.id])},
        ).data
        data["found"] = True
        return Response({"data": data, "message": "Success"})


@extend_schema(tags=["Inventory"])
class AdminStockIntakeView(APIView):
    serializer_class = StockIntakeSerializer
    """Stock App intake: receive `quantity` of an existing variant, posting a
    purchase_in ledger movement."""

    permission_classes: ClassVar[list] = [InventoryAdjustPermission]

    def post(self, request) -> Response:
        serializer = StockIntakeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        variant = get_variant_by_id(data.pop("variant_id"))
        if variant is None:
            return error_from_exception(DomainError("Variant not found.", code="variant_not_found"))

        data["warehouse"] = data.pop("warehouse_id", None)

        try:
            entry = stock_intake(variant=variant, actor=request.user, **data)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": StockLedgerEntrySerializer(entry).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Inventory"])
class AdminQuickProductCreateView(APIView):
    serializer_class = StockLookupVariantSerializer
    """Stock App create: when a SKU/barcode doesn't exist yet, create the
    product and its first variant atomically so it can be stocked right away."""

    permission_classes: ClassVar[list] = [StockAppCreatePermission]

    def post(self, request) -> Response:
        serializer = QuickProductCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        category = get_category_by_id(data.pop("category_id"))
        if category is None:
            return error_from_exception(
                DomainError("Category not found.", code="category_not_found")
            )

        try:
            variant = create_quick_product(category=category, actor=request.user, **data)
        except DomainError as exc:
            return error_from_exception(exc)
        result = StockLookupVariantSerializer(
            variant,
            context={"available_by_variant": available_quantities_for_variants([variant.id])},
        ).data
        result["found"] = True
        return Response(
            {"data": result, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Inventory"])
class AdminWarehouseListCreateView(InventoryPermissionMixin, GenericListAPIView):
    serializer_class = WarehouseSerializer
    search_fields = ("name", "code")
    ordering_fields = ("name", "created_at")
    default_ordering = "name"

    def get_queryset(self):
        queryset = all_warehouses()
        is_active = get_bool(self.request.query_params, "is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)
        kind = get_kind(self.request.query_params)
        return queryset.filter(kind=kind) if kind else queryset

    def get(self, request) -> Response:
        return self.list_response(request)

    def post(self, request) -> Response:
        serializer = WarehouseCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        warehouse = create_warehouse(data=dict(serializer.validated_data), actor=request.user)
        return Response(
            {"data": WarehouseSerializer(warehouse).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Inventory"])
class AdminWarehouseDetailView(InventoryPermissionMixin, APIView):
    serializer_class = WarehouseSerializer

    def get(self, request, warehouse_id) -> Response:
        try:
            warehouse = get_warehouse_by_id(warehouse_id)
        except (ValueError, TypeError):
            return not_found("warehouse_not_found", "Warehouse not found.")
        if warehouse is None:
            return not_found("warehouse_not_found", "Warehouse not found.")
        return Response({"data": WarehouseSerializer(warehouse).data, "message": "Success"})

    def patch(self, request, warehouse_id) -> Response:
        try:
            warehouse = get_warehouse_by_id(warehouse_id)
        except (ValueError, TypeError):
            return not_found("warehouse_not_found", "Warehouse not found.")
        if warehouse is None:
            return not_found("warehouse_not_found", "Warehouse not found.")
        serializer = WarehouseUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            warehouse = update_warehouse(
                warehouse=warehouse, data=dict(serializer.validated_data), actor=request.user
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": WarehouseSerializer(warehouse).data, "message": "Success"})

    def delete(self, request, warehouse_id) -> Response:
        try:
            warehouse = get_warehouse_by_id(warehouse_id)
        except (ValueError, TypeError):
            return not_found("warehouse_not_found", "Warehouse not found.")
        if warehouse is None:
            return not_found("warehouse_not_found", "Warehouse not found.")
        try:
            delete_warehouse(warehouse=warehouse, actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": {}, "message": "Success"})


@extend_schema(tags=["Inventory"])
class AdminStockTransferListCreateView(InventoryPermissionMixin, GenericListAPIView):
    """Move available stock between two warehouses of the same kind, and the
    history of those moves."""

    serializer_class = StockTransferSerializer
    search_fields = ("transfer_number", "notes", "lines__variant__sku")
    product_code_field = "lines__variant__product__product_code"
    ordering_fields = ("created_at",)
    default_ordering = "-created_at"

    def get_queryset(self):
        params = self.request.query_params
        return transfers_list(
            warehouse=get_related(
                params, "warehouse_id", get_warehouse_by_id, "Warehouse not found."
            ),
            variant=get_related(params, "variant_id", get_variant_by_id, "Variant not found."),
            kind=get_kind(params),
        )

    def get(self, request) -> Response:
        return self.list_response(request)

    def post(self, request) -> Response:
        serializer = StockTransferCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        warehouses = {}
        for field in ("from_warehouse_id", "to_warehouse_id"):
            warehouse = get_warehouse_by_id(data[field])
            if warehouse is None:
                return not_found("warehouse_not_found", "Warehouse not found.")
            warehouses[field] = warehouse

        lines = []
        for line in data["lines"]:
            variant = get_variant_by_id(line["variant_id"])
            if variant is None:
                return error_from_exception(
                    DomainError("Variant not found.", code="variant_not_found")
                )
            lines.append({"variant": variant, "quantity": line["quantity"]})

        try:
            transfer = transfer_stock(
                from_warehouse=warehouses["from_warehouse_id"],
                to_warehouse=warehouses["to_warehouse_id"],
                lines=lines,
                notes=data["notes"],
                actor=request.user,
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {
                "data": StockTransferSerializer(get_transfer_by_id(transfer.id)).data,
                "message": "Success",
            },
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Inventory"])
class AdminStockTransferDetailView(APIView):
    serializer_class = StockTransferSerializer
    permission_classes: ClassVar[list] = [InventoryViewPermission]

    def get(self, request, transfer_id) -> Response:
        transfer = get_transfer_by_id(transfer_id)
        if transfer is None:
            return not_found("transfer_not_found", "Transfer not found.")
        return Response({"data": StockTransferSerializer(transfer).data, "message": "Success"})
