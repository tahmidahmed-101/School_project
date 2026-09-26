from __future__ import annotations

from typing import ClassVar

from django.contrib import admin

from apps.accounts.constants import StaffPermissionCode
from apps.common.admin import StaffPermissionAdminMixin

from .models import (
    Payment,
    PaymentMethodSetting,
    ReturnRMA,
    ReturnRMALine,
    SalesOrder,
    SalesOrderLine,
    Shipment,
    ShipmentLine,
    StockReservation,
)


class SalesOrderLineInline(admin.TabularInline):
    model = SalesOrderLine
    extra = 0
    fields = ("variant", "quantity", "unit_price", "tax_amount", "is_preorder")
    autocomplete_fields = ("variant",)
    readonly_fields = ("is_preorder",)

    def has_change_permission(self, request, obj=None) -> bool:
        # lines are immutable once the order leaves "pending"
        if obj and obj.status != SalesOrder.Status.PENDING:
            return False
        return super().has_change_permission(request, obj)


class ShipmentLineInline(admin.TabularInline):
    model = ShipmentLine
    extra = 0
    fields = ("order_line", "quantity")


class ReturnRMALineInline(admin.TabularInline):
    model = ReturnRMALine
    extra = 0
    fields = ("order_line", "quantity", "condition")


@admin.register(SalesOrder)
class SalesOrderAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.ORDERS_VIEW
    manage_permission_code = StaffPermissionCode.ORDERS_MANAGE
    date_hierarchy = "created_at"
    list_display = ("order_number", "customer", "status", "grand_total")
    list_filter = ("status",)
    search_fields = ("order_number", "customer__email")
    inlines: ClassVar[list] = [SalesOrderLineInline]


@admin.register(Shipment)
class ShipmentAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.SHIPMENTS_VIEW
    manage_permission_code = StaffPermissionCode.SHIPMENTS_UPDATE
    list_display = (
        "order",
        "carrier",
        "tracking_number",
        "status",
        "shipping_charge",
        "cod_amount",
        "shipped_at",
        "delivered_at",
    )
    list_filter = ("status", "carrier")
    search_fields = ("order__order_number", "tracking_number")
    autocomplete_fields = ("order", "carrier")
    inlines: ClassVar[list] = [ShipmentLineInline]


@admin.register(ReturnRMA)
class ReturnRMAAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.RETURNS_MANAGE
    manage_permission_code = StaffPermissionCode.RETURNS_MANAGE
    list_display = ("rma_number", "order", "status", "reason")
    list_filter = ("status",)
    search_fields = ("rma_number", "order__order_number")
    autocomplete_fields = ("order",)
    inlines: ClassVar[list] = [ReturnRMALineInline]
    actions = ["approve", "reject"]  # noqa: RUF012 -- not ClassVar in django-stubs

    @admin.action(description="Approve selected RMAs")
    def approve(self, request, queryset):
        queryset.filter(status="requested").update(status="approved")

    @admin.action(description="Reject selected RMAs")
    def reject(self, request, queryset):
        queryset.filter(status="requested").update(status="rejected")


@admin.register(Payment)
class PaymentAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.ORDERS_VIEW
    manage_permission_code = None  # payments are gateway-driven, admin is read-only
    list_display = ("order", "amount", "refunded_amount", "method", "status", "gateway_reference")
    list_filter = ("status", "method")
    search_fields = ("order__order_number", "gateway_reference")
    autocomplete_fields = ("order",)

    def has_add_permission(self, request) -> bool:
        return False


@admin.register(StockReservation)
class StockReservationAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.ORDERS_VIEW
    manage_permission_code = None  # reservations are lifecycle-driven, not manually editable
    list_display = ("order_line", "variant", "quantity", "status")
    list_filter = ("status",)
    autocomplete_fields = ("variant",)

    def has_add_permission(self, request) -> bool:
        return False


@admin.register(PaymentMethodSetting)
class PaymentMethodSettingAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.ORDERS_VIEW
    manage_permission_code = None  # the operator owns this switch, in the dashboard
    list_display = ("key", "is_enabled", "updated_at")
    list_filter = ("is_enabled",)

    def has_add_permission(self, request) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False
