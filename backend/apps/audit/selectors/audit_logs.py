from __future__ import annotations

from django.db.models import QuerySet

from apps.audit.models import AuditLog, LoginHistory


def all_audit_logs() -> QuerySet[AuditLog]:
    return AuditLog.objects.select_related("actor")


def get_audit_log_by_id(log_id) -> AuditLog | None:
    return AuditLog.objects.select_related("actor").filter(id=log_id).first()


def all_login_history() -> QuerySet[LoginHistory]:
    return LoginHistory.objects.all()
