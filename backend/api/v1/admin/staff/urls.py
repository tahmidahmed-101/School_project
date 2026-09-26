from __future__ import annotations

from django.urls import path

from .views import (
    StaffDetailView,
    StaffListCreateView,
    StaffPermissionCodeListView,
    StaffPermissionsView,
    StaffRestoreView,
)

app_name = "admin_staff"

urlpatterns = [
    path("", StaffListCreateView.as_view(), name="staff-list"),
    path("permission-codes/", StaffPermissionCodeListView.as_view(), name="permission-codes"),
    path("<uuid:user_id>/", StaffDetailView.as_view(), name="staff-detail"),
    path("<uuid:user_id>/restore/", StaffRestoreView.as_view(), name="staff-restore"),
    path("<uuid:user_id>/permissions/", StaffPermissionsView.as_view(), name="staff-permissions"),
]
