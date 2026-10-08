from __future__ import annotations

from typing import ClassVar

from django.contrib import admin

from apps.accounts.constants import StaffPermissionCode
from apps.common.admin import HTTPS_URL_FORMFIELD_OVERRIDES, StaffPermissionAdminMixin

from .models import Carrier, ShippingRate, ShippingZone


class ShippingRateInline(admin.TabularInline):
    model = ShippingRate
    extra = 0
    fields = ("carrier", "base_weight", "base_charge", "increment_weight", "increment_charge")
    autocomplete_fields = ("carrier",)


@admin.register(Carrier)
class CarrierAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.SHIPMENTS_VIEW
    manage_permission_code = StaffPermissionCode.SHIPMENTS_UPDATE
    list_display = ("name", "code", "is_integration_enabled", "is_active")
    list_filter = ("code", "is_integration_enabled", "is_active")
    search_fields = ("name", "phone", "contact_email")
    formfield_overrides = HTTPS_URL_FORMFIELD_OVERRIDES


@admin.register(ShippingZone)
class ShippingZoneAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.SHIPMENTS_VIEW
    manage_permission_code = StaffPermissionCode.SHIPMENTS_UPDATE
    list_display = ("name", "kind", "is_active")
    list_filter = ("kind",)
    search_fields = ("name",)
    inlines: ClassVar[list] = [ShippingRateInline]

    def get_readonly_fields(self, request, obj=None):
        return ("kind",) if obj is not None else ()

    def save_formset(self, request, form, formset, change) -> None:
        for rate in formset.save(commit=False):
            rate.kind = form.instance.kind
            rate.save()
        for removed in formset.deleted_objects:
            removed.delete()
        formset.save_m2m()


@admin.register(ShippingRate)
class ShippingRateAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.SHIPMENTS_VIEW
    manage_permission_code = StaffPermissionCode.SHIPMENTS_UPDATE
    list_display = (
        "zone",
        "kind",
        "carrier",
        "base_weight",
        "base_charge",
        "increment_weight",
        "increment_charge",
    )
    list_filter = ("kind", "zone", "carrier")
    autocomplete_fields = ("zone", "carrier")
    readonly_fields = ("kind",)

    def save_model(self, request, obj, form, change) -> None:
        obj.kind = obj.zone.kind
        super().save_model(request, obj, form, change)
