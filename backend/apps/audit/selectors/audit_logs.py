from __future__ import annotations

from django.db.models import QuerySet

from apps.audit.models import AuditLog, LoginHistory


def all_audit_logs() -> QuerySet[AuditLog]:
    return AuditLog.objects.select_related("actor")


def get_audit_log_by_id(log_id) -> AuditLog | None:
    return AuditLog.objects.select_related("actor").filter(id=log_id).first()


def audit_logs_for_actor(actor_id) -> QuerySet[AuditLog]:
    return AuditLog.objects.select_related("actor").filter(actor_id=actor_id)


def all_login_history() -> QuerySet[LoginHistory]:
    return LoginHistory.objects.all()


def login_history_for_user(user_id) -> QuerySet[LoginHistory]:
    return LoginHistory.objects.filter(user_id=user_id)
