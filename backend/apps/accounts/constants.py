from django.db import models


class UserRole(models.TextChoices):
    ADMIN = "admin", "Admin"
    STAFF = "staff", "Staff"
    CUSTOMER = "customer", "Customer"


class StaffPermissionCode(models.TextChoices):
    """Example staff permission codes. Extend with domain-specific codes
    (e.g. "orders.view", "orders.update_status") as new apps are added."""

    USERS_VIEW = "users.view", "View users"
    REPORTS_VIEW = "reports.view", "View reports"

    CATALOG_VIEW = "catalog.view", "View catalog"
    CATALOG_MANAGE = "catalog.manage", "Manage catalog"
    INVENTORY_VIEW = "inventory.view", "View inventory"
    INVENTORY_MANAGE = "inventory.manage", "Manage inventory"
    INVENTORY_ADJUST = "inventory.adjust", "Adjust inventory"
    INVENTORY_TRANSFER = "inventory.transfer", "Transfer inventory"

    PURCHASING_VIEW = "purchasing.view", "View purchasing"
    PURCHASING_MANAGE = "purchasing.manage", "Manage purchasing"

    ORDERS_VIEW = "orders.view", "View orders"
    ORDERS_MANAGE = "orders.manage", "Manage orders"
    REFUNDS_APPROVE = "refunds.approve", "Approve refunds"
    RETURNS_MANAGE = "returns.manage", "Manage returns"

    SHIPMENTS_VIEW = "shipments.view", "View shipments"
    SHIPMENTS_UPDATE = "shipments.update", "Update shipments"

    ACCOUNTING_VIEW = "accounting.view", "View accounting"
    ACCOUNTING_POST = "accounting.post", "Post accounting entries"
    INVOICES_MANAGE = "invoices.manage", "Manage invoices"

    SETTINGS_VIEW = "settings.view", "View business settings"
    SETTINGS_MANAGE = "settings.manage", "Manage business settings"

    MARKETING_VIEW = "marketing.view", "View newsletter subscribers"
    MARKETING_MANAGE = "marketing.manage", "Manage newsletter subscribers"

    RISK_VIEW = "risk.view", "View fraud & risk"
    RISK_MANAGE = "risk.manage", "Manage fraud & risk (blocklists, cases)"
