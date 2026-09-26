from __future__ import annotations

from django import forms
from django.contrib import admin, messages
from django.shortcuts import render

from apps.accounts.constants import StaffPermissionCode
from apps.common.admin import StaffPermissionAdminMixin
from apps.common.exceptions import DomainError

from .models import StockItem, StockLedgerEntry
from .services.stock import post_adjustment


class StockAdjustmentForm(forms.Form):
    _selected_action = forms.CharField(widget=forms.MultipleHiddenInput)
    quantity_delta = forms.IntegerField(help_text="Positive to add stock, negative to remove it.")
    notes = forms.CharField(required=False, widget=forms.Textarea)


@admin.register(StockItem)
class StockItemAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.INVENTORY_VIEW
    manage_permission_code = None  # never directly editable
    list_display = (
        "variant",
        "quantity_on_hand",
        "quantity_reserved",
        "available",
        "avg_cost",
    )
    search_fields = ("variant__sku",)
    actions = ["post_adjustment_action"]  # noqa: RUF012 -- not ClassVar in django-stubs

    @admin.display(description="Available")
    def available(self, obj: StockItem) -> int:
        return obj.available

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False

    @admin.action(description="Post a stock adjustment (cycle count correction)")
    def post_adjustment_action(self, request, queryset):
        if not self._has_code(request, StaffPermissionCode.INVENTORY_ADJUST) and not self._has_code(
            request, StaffPermissionCode.INVENTORY_MANAGE
        ):
            self.message_user(
                request, "You do not have permission to adjust stock.", messages.ERROR
            )
            return None

        if "apply" in request.POST:
            form = StockAdjustmentForm(request.POST)
            if form.is_valid():
                quantity_delta = form.cleaned_data["quantity_delta"]
                notes = form.cleaned_data["notes"]
                errors = []
                for stock_item in queryset:
                    try:
                        post_adjustment(
                            variant=stock_item.variant,
                            quantity_delta=quantity_delta,
                            notes=notes,
                            actor=request.user,
                        )
                    except DomainError as exc:
                        errors.append(f"{stock_item}: {exc.message}")
                if errors:
                    self.message_user(request, "; ".join(errors), messages.ERROR)
                else:
                    self.message_user(request, f"Adjustment posted for {queryset.count()} item(s).")
                return None
        else:
            form = StockAdjustmentForm(
                initial={"_selected_action": request.POST.getlist("_selected_action")}
            )

        return render(
            request,
            "admin/inventory/stock_adjustment.html",
            {"items": queryset, "form": form, "title": "Post stock adjustment"},
        )


@admin.register(StockLedgerEntry)
class StockLedgerEntryAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.INVENTORY_VIEW
    manage_permission_code = None  # append-only, no admin writes ever
    date_hierarchy = "created_at"
    list_display = (
        "created_at",
        "variant",
        "movement_type",
        "quantity",
        "balance_after",
    )
    list_filter = ("movement_type",)
    search_fields = ("variant__sku", "reference_type", "reference_id")

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False
