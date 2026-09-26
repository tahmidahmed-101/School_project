from django.contrib import admin

from .models import AuditLog, LoginHistory


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("action", "actor", "target_type", "target_id", "ip_address", "created_at")
    list_filter = ("action", "target_type")
    search_fields = ("actor__email", "action", "target_type", "target_id")
    date_hierarchy = "created_at"
    readonly_fields = (
        "actor",
        "action",
        "target_type",
        "target_id",
        "ip_address",
        "user_agent",
        "metadata",
        "created_at",
    )

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False


@admin.register(LoginHistory)
class LoginHistoryAdmin(admin.ModelAdmin):
    list_display = ("email", "user", "was_successful", "ip_address", "created_at")
    list_filter = ("was_successful",)
    search_fields = ("email", "user__email", "ip_address")
    date_hierarchy = "created_at"
    readonly_fields = ("user", "email", "ip_address", "user_agent", "was_successful", "created_at")

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False
