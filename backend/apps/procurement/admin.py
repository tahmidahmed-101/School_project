from __future__ import annotations

from typing import ClassVar

from django.contrib import admin

from apps.accounts.constants import StaffPermissionCode
from apps.common.admin import StaffPermissionAdminMixin

from .models import (
    GoodsReceiptNote,
    GRNLine,
    PurchaseOrder,
    PurchaseOrderLine,
    Supplier,
    VendorBill,
    VendorPayment,
)


class PurchaseOrderLineInline(admin.TabularInline):
    model = PurchaseOrderLine
    extra = 0
    fields = ("variant", "quantity_ordered", "quantity_received", "unit_cost")
    autocomplete_fields = ("variant",)


class GRNLineInline(admin.TabularInline):
    model = GRNLine
    extra = 0
    fields = ("purchase_order_line", "quantity_received", "condition")


class VendorPaymentInline(admin.TabularInline):
    model = VendorPayment
    extra = 0
    fields = ("amount", "paid_at", "method", "reference")


@admin.register(Supplier)
class SupplierAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.PURCHASING_MANAGE
    manage_permission_code = StaffPermissionCode.PURCHASING_MANAGE
    list_display = ("name", "contact_email", "payment_terms", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "contact_email")


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.PURCHASING_MANAGE
    manage_permission_code = StaffPermissionCode.PURCHASING_MANAGE
    list_display = ("po_number", "supplier", "status", "order_date")
    list_filter = ("status",)
    search_fields = ("po_number", "supplier__name")
    inlines: ClassVar[list] = [PurchaseOrderLineInline]
    actions = ["mark_submitted"]  # noqa: RUF012 -- not ClassVar in django-stubs

    @admin.action(description="Mark selected POs as submitted")
    def mark_submitted(self, request, queryset):
        queryset.filter(status=PurchaseOrder.Status.DRAFT).update(
            status=PurchaseOrder.Status.SUBMITTED
        )


@admin.register(GoodsReceiptNote)
class GoodsReceiptNoteAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.INVENTORY_VIEW
    manage_permission_code = StaffPermissionCode.INVENTORY_MANAGE
    list_display = ("purchase_order", "received_date", "received_by", "status")
    list_filter = ("status",)
    autocomplete_fields = ("purchase_order",)
    inlines: ClassVar[list] = [GRNLineInline]


@admin.register(VendorBill)
class VendorBillAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.ACCOUNTING_VIEW
    manage_permission_code = StaffPermissionCode.ACCOUNTING_POST
    list_display = ("bill_number", "supplier", "purchase_order", "amount", "due_date", "status")
    list_filter = ("status",)
    search_fields = ("bill_number", "supplier__name")
    autocomplete_fields = ("supplier", "purchase_order")
    inlines: ClassVar[list] = [VendorPaymentInline]


@admin.register(VendorPayment)
class VendorPaymentAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.ACCOUNTING_VIEW
    manage_permission_code = StaffPermissionCode.ACCOUNTING_POST
    list_display = ("vendor_bill", "amount", "paid_at", "method")
    list_filter = ("method",)
    search_fields = ("vendor_bill__bill_number", "reference")
    autocomplete_fields = ("vendor_bill",)
