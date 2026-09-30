from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from django.db.models import QuerySet

from apps.audit.models import AuditLog

EXPORT_COLUMNS = [
    "created_at",
    "actor",
    "action",
    "target_type",
    "target_id",
    "ip_address",
    "user_agent",
    "metadata",
]


def export_audit_logs(queryset: QuerySet[AuditLog]) -> list[Sequence[Any]]:
    return [
        [
            log.created_at.isoformat(),
            log.actor.email if log.actor is not None else "",
            log.action,
            log.target_type,
            log.target_id,
            log.ip_address or "",
            log.user_agent,
            log.metadata,
        ]
        for log in queryset.select_related("actor")
    ]
