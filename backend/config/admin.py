from __future__ import annotations

from django.contrib import admin

admin.site.site_header = "ERP Admin"
admin.site.site_title = "ERP Admin"
admin.site.index_title = "Dashboard"

_PINNED_APP_ORDER = ["business", "accounts"]
_original_get_app_list = admin.AdminSite.get_app_list


def _get_app_list(self, request, app_label=None):
    app_list = _original_get_app_list(self, request, app_label)
    order = {label: index for index, label in enumerate(_PINNED_APP_ORDER)}
    app_list.sort(key=lambda app: order.get(app["app_label"], len(order)))
    return app_list


admin.AdminSite.get_app_list = _get_app_list  # type: ignore[method-assign]
