from __future__ import annotations

from django.urls import include, path

app_name = "admin_api"

urlpatterns = [
    path("users/", include("api.v1.admin.users.urls")),
    path("staff/", include("api.v1.admin.staff.urls")),
    path("audit/", include("api.v1.admin.audit.urls")),
    path("catalog/", include("api.v1.admin.catalog.urls")),
    path("media/", include("api.v1.admin.media.urls")),
    path("inventory/", include("api.v1.admin.inventory.urls")),
    path("procurement/", include("api.v1.admin.procurement.urls")),
    path("orders/", include("api.v1.admin.orders.urls")),
    path("coupons/", include("api.v1.admin.coupons.urls")),
    path("marketing/", include("api.v1.admin.marketing.urls")),
    path("logistics/", include("api.v1.admin.logistics.urls")),
    path("accounting/", include("api.v1.admin.accounting.urls")),
    path("reporting/", include("api.v1.admin.reporting.urls")),
    path("settings/", include("api.v1.admin.business.urls")),
    path("risk/", include("api.v1.admin.risk.urls")),
]
