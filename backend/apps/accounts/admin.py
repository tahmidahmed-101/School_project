from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import Address, StaffPermission, User, UserOTP


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ("email",)
    list_display = ("email", "role", "is_active", "is_staff", "is_email_verified", "date_joined")
    list_filter = ("role", "is_active", "is_staff", "is_superuser", "is_email_verified")
    search_fields = ("email", "first_name", "last_name", "phone")
    fieldsets = (
        *(DjangoUserAdmin.fieldsets or ()),
        (
            "Profile",
            {
                "fields": (
                    "role",
                    "phone",
                    "profile_picture",
                    "is_email_verified",
                    "is_phone_verified",
                    "deleted_at",
                )
            },
        ),
    )
    add_fieldsets = (
        *(DjangoUserAdmin.add_fieldsets or ()),
        (
            "Profile",
            {"fields": ("email", "role")},
        ),
    )


@admin.register(StaffPermission)
class StaffPermissionAdmin(admin.ModelAdmin):
    list_display = ("user", "permission_code", "is_enabled", "granted_by", "granted_at")
    list_filter = ("permission_code", "is_enabled")
    search_fields = ("user__email", "permission_code")
    autocomplete_fields = ("user", "granted_by")


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ("user", "full_name", "phone", "city", "country", "is_default")
    list_filter = ("country", "is_default")
    search_fields = ("user__email", "full_name", "city", "postal_code")
    autocomplete_fields = ("user",)


@admin.register(UserOTP)
class UserOTPAdmin(admin.ModelAdmin):
    list_display = ("user", "purpose", "expires_at", "consumed_at")
    list_filter = ("purpose", "consumed_at")
    search_fields = ("user__email",)
    readonly_fields = ("code_hash",)
