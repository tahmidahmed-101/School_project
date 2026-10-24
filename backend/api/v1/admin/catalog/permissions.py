from __future__ import annotations

from apps.accounts.constants import StaffPermissionCode
from apps.common.permissions import require_any_staff_permission, require_staff_permission

VARIANT_SEARCH_FIELDS = ("sku", "barcode", "product__name", "product__product_code", "title")

CatalogManagePermission = require_staff_permission(StaffPermissionCode.CATALOG_MANAGE)
CatalogViewPermission = require_any_staff_permission(
    StaffPermissionCode.CATALOG_VIEW, StaffPermissionCode.CATALOG_MANAGE
)


class CatalogPermissionMixin:
    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [CatalogViewPermission()]
        return [CatalogManagePermission()]
