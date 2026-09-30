from __future__ import annotations

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.common.exceptions import BusinessRuleViolationError
from apps.risk.models import IPBlock


@transaction.atomic
def block_ip(raw_ip: str, *, reason: str, staff=None, expires_at=None) -> IPBlock:
    """Re-blocking an already-blocked address updates its reason/expiry
    rather than erroring."""
    ip = (raw_ip or "").strip()
    if not ip:
        raise BusinessRuleViolationError("An IP address is required.", code="ip_required")
    if not (reason or "").strip():
        raise BusinessRuleViolationError(
            "A block needs a reason someone can read later.", code="reason_required"
        )

    block, created = IPBlock.objects.get_or_create(
        ip_address=ip,
        defaults={
            "reason": reason.strip(),
            "created_by": staff if getattr(staff, "pk", None) else None,
            "expires_at": expires_at,
        },
    )
    if not created:
        block.reason = reason.strip()
        block.expires_at = expires_at
        block.save(update_fields=["reason", "expires_at", "updated_at"])
    return block


@transaction.atomic
def unblock_ip(raw_ip: str) -> None:
    ip = (raw_ip or "").strip()
    deleted, _ = IPBlock.objects.filter(ip_address=ip).delete()
    if not deleted:
        raise BusinessRuleViolationError(f"{raw_ip} is not blocked.", code="not_blocked")


def is_blocked(raw_ip: str) -> bool:
    ip = (raw_ip or "").strip()
    if not ip:
        return False
    active = Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())
    return IPBlock.objects.filter(ip_address=ip).filter(active).exists()


def blocks_list():
    return IPBlock.objects.select_related("created_by")
