from __future__ import annotations

from django.urls import path

from .views import (
    AuditLogDetailView,
    AuditLogExportView,
    AuditLogListView,
    LoginHistoryListView,
)

app_name = "admin_audit"

urlpatterns = [
    path("", AuditLogListView.as_view(), name="audit-log-list"),
    path("export/", AuditLogExportView.as_view(), name="audit-log-export"),
    path("login-history/", LoginHistoryListView.as_view(), name="login-history-list"),
    path("<uuid:log_id>/", AuditLogDetailView.as_view(), name="audit-log-detail"),
]
