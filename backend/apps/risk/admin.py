from __future__ import annotations

from django.contrib import admin

from apps.accounts.constants import StaffPermissionCode
from apps.common.admin import StaffPermissionAdminMixin

from .models import FraudCase, IPBlock, PhoneBlock, PhoneRiskProfile, RiskAssessment


@admin.register(RiskAssessment)
class RiskAssessmentAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.RISK_VIEW
    manage_permission_code = StaffPermissionCode.RISK_MANAGE
    list_display = ("order", "risk_level", "risk_score", "recommended_action", "created_at")
    list_filter = ("risk_level", "recommended_action")
    search_fields = ("order__order_number",)


@admin.register(FraudCase)
class FraudCaseAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.RISK_VIEW
    manage_permission_code = StaffPermissionCode.RISK_MANAGE
    list_display = ("case_number", "status", "order", "assigned_to", "created_at")
    list_filter = ("status",)
    search_fields = ("case_number", "order__order_number")


@admin.register(PhoneRiskProfile)
class PhoneRiskProfileAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.RISK_VIEW
    manage_permission_code = StaffPermissionCode.RISK_MANAGE
    list_display = ("phone_number", "success_rate", "total_orders", "returned_count")
    search_fields = ("phone_number",)


@admin.register(PhoneBlock)
class PhoneBlockAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.RISK_VIEW
    manage_permission_code = StaffPermissionCode.RISK_MANAGE
    list_display = ("phone_number", "strength", "origin", "lifted_at")
    list_filter = ("strength", "origin")
    search_fields = ("phone_number",)


@admin.register(IPBlock)
class IPBlockAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.RISK_VIEW
    manage_permission_code = StaffPermissionCode.RISK_MANAGE
    list_display = ("ip_address", "expires_at", "created_at")
    search_fields = ("ip_address",)
