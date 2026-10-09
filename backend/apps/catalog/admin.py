from __future__ import annotations

from typing import ClassVar

from django.contrib import admin

from apps.accounts.constants import StaffPermissionCode
from apps.common.admin import StaffPermissionAdminMixin

from .models import (
    BundleItem,
    Category,
    Product,
    ProductImage,
    ProductVariant,
)


class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 0
    fields = (
        "sku",
        "barcode",
        "title",
        "price",
        "cost_price",
        "discount_price",
        "is_preorder_enabled",
        "preorder_price",
        "preorder_start_date",
        "preorder_end_date",
        "release_date",
        "preorder_stock_limit",
        "is_active",
    )
    readonly_fields = ("title",)


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 0
    fields = ("url", "sort_order")


@admin.register(Category)
class CategoryAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.CATALOG_MANAGE
    manage_permission_code = StaffPermissionCode.CATALOG_MANAGE
    list_display = ("name", "parent", "category_type", "is_active")
    list_filter = ("category_type", "is_active")
    search_fields = ("name", "slug")
    prepopulated_fields: ClassVar[dict] = {"slug": ("name",)}
    autocomplete_fields = ("parent",)


@admin.register(Product)
class ProductAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.CATALOG_MANAGE
    manage_permission_code = StaffPermissionCode.CATALOG_MANAGE
    list_display = ("name", "category", "product_type", "is_active")
    list_filter = ("category", "product_type", "is_active")
    search_fields = ("name", "slug", "variants__sku")
    prepopulated_fields: ClassVar[dict] = {"slug": ("name",)}
    autocomplete_fields = ("category",)
    inlines: ClassVar[list] = [ProductVariantInline, ProductImageInline]


@admin.register(ProductVariant)
class ProductVariantAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.CATALOG_MANAGE
    manage_permission_code = StaffPermissionCode.CATALOG_MANAGE
    list_display = (
        "sku",
        "product",
        "title",
        "price",
        "cost_price",
        "discount_price",
        "is_preorder_enabled",
        "preorder_price",
        "preorder_start_date",
        "preorder_end_date",
        "release_date",
        "is_active",
    )
    list_filter = ("is_active", "is_preorder_enabled")
    search_fields = ("sku", "barcode", "product__name", "title")
    autocomplete_fields = ("product",)
    exclude = ("color", "size", "option_values")
    readonly_fields = ("title",)


@admin.register(BundleItem)
class BundleItemAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.CATALOG_MANAGE
    manage_permission_code = StaffPermissionCode.CATALOG_MANAGE
    list_display = ("bundle_variant", "component_variant", "quantity")
    autocomplete_fields = ("bundle_variant", "component_variant")


@admin.register(ProductImage)
class ProductImageAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.CATALOG_MANAGE
    manage_permission_code = StaffPermissionCode.CATALOG_MANAGE
    list_display = ("__str__", "product", "variant", "sort_order")
    search_fields = ("url", "product__name", "variant__sku")
    autocomplete_fields = ("product", "variant")
