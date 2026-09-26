from __future__ import annotations

import logging
from typing import Any

from apps.audit.middleware import get_current_request_meta
from apps.audit.models import AuditLog, LoginHistory

audit_logger = logging.getLogger("audit")
security_logger = logging.getLogger("security")


def log_action(
    *,
    actor=None,
    action: str,
    target_type: str = "",
    target_id: Any = "",
    metadata: dict | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> AuditLog:
    """Record an audit log entry. Falls back to the current request's
    IP/user-agent (see `apps.audit.middleware`) when not passed explicitly.
    """
    request_meta = get_current_request_meta()
    entry = AuditLog.objects.create(
        actor=actor,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id else "",
        ip_address=ip_address or request_meta.get("ip_address") or None,
        user_agent=user_agent or request_meta.get("user_agent", ""),
        metadata=metadata or {},
    )
    audit_logger.info(
        "%s actor=%s target=%s:%s", action, actor_id_of(actor), target_type, entry.target_id
    )
    return entry


def actor_id_of(actor) -> str:
    return str(actor.id) if actor is not None else "system"


def record_login_attempt(
    *,
    user=None,
    email: str,
    was_successful: bool,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> LoginHistory:
    request_meta = get_current_request_meta()
    entry = LoginHistory.objects.create(
        user=user,
        email=email,
        was_successful=was_successful,
        ip_address=ip_address or request_meta.get("ip_address") or None,
        user_agent=user_agent or request_meta.get("user_agent", ""),
    )
    if not was_successful:
        security_logger.warning("Failed login attempt for %s", email)
    return entry
