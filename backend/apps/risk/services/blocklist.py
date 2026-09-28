"""The list of numbers a merchant will not sell to on credit.

``PhoneRiskProfile`` produces a *score*; this produces a *decision*. Keeping
them apart means a merchant can disagree with the score on one number without
editing the scoring rules for everyone else.
"""

from __future__ import annotations

import logging
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.common.exceptions import BusinessRuleViolationError
from apps.common.utils.phone import BD_MOBILE_HELP, is_bd_mobile
from apps.risk.models import PhoneBlock, PhoneRiskProfile
from apps.risk.services.phone_profile import MIN_SETTLED_ORDERS, normalise_phone

logger = logging.getLogger(__name__)

# A number that fails more than half its settled deliveries, with enough
# history for that to mean something, is the RTO offender this guards. Advance
# -only rather than refused: the merchant still wants the sale, they just will
# not fund the courier twice for it.
AUTO_FLAG_SUCCESS_RATE = Decimal("40.00")
AUTO_FLAG_MIN_RETURNS = 2


@transaction.atomic
def block_phone(
    raw_phone: str,
    *,
    reason: str,
    strength: str = PhoneBlock.Strength.ADVANCE_ONLY,
    staff=None,
    origin: str = PhoneBlock.Origin.MANUAL,
) -> PhoneBlock:
    """Add or strengthen a block.

    Re-blocking an already-blocked number keeps the stronger of the two
    decisions and reopens a lifted one, rather than refusing the write.
    """
    phone = normalise_phone(raw_phone)
    if not phone:
        raise BusinessRuleViolationError("A phone number is required.", code="phone_required")
    if not is_bd_mobile(phone):
        raise BusinessRuleViolationError(BD_MOBILE_HELP, code="invalid_phone")
    if not (reason or "").strip():
        raise BusinessRuleViolationError(
            "A block needs a reason someone can read later.", code="reason_required"
        )

    block, created = PhoneBlock.objects.get_or_create(
        phone_number=phone,
        defaults={
            "strength": strength,
            "origin": origin,
            "reason": reason.strip(),
            "created_by": staff if getattr(staff, "pk", None) else None,
        },
    )
    if created:
        return block

    if strength == PhoneBlock.Strength.BLOCKED:
        block.strength = strength
    block.reason = reason.strip()
    block.lifted_at = None
    block.lifted_by = None
    block.lift_reason = ""
    block.save(
        update_fields=["strength", "reason", "lifted_at", "lifted_by", "lift_reason", "updated_at"]
    )
    return block


@transaction.atomic
def lift_block(raw_phone: str, *, reason: str = "", staff=None) -> PhoneBlock:
    """Stop enforcing a block, keeping the record that it existed."""
    phone = normalise_phone(raw_phone)
    block = PhoneBlock.objects.filter(phone_number=phone).first()
    if block is None:
        raise BusinessRuleViolationError(f"{raw_phone} is not blocked.", code="not_blocked")

    block.lifted_at = timezone.now()
    block.lifted_by = staff if getattr(staff, "pk", None) else None
    block.lift_reason = (reason or "").strip()
    block.save(update_fields=["lifted_at", "lifted_by", "lift_reason", "updated_at"])
    return block


def active_block(raw_phone: str) -> PhoneBlock | None:
    phone = normalise_phone(raw_phone)
    if not phone:
        return None
    return PhoneBlock.objects.filter(phone_number=phone, lifted_at__isnull=True).first()


def is_blocked(raw_phone: str) -> bool:
    """True only for a full refusal -- advance-only is not a refusal."""
    block = active_block(raw_phone)
    return block is not None and block.strength == PhoneBlock.Strength.BLOCKED


def blocks_list(*, strength: str = "", include_lifted: bool = False):
    queryset = PhoneBlock.objects.select_related("created_by", "lifted_by")
    if not include_lifted:
        queryset = queryset.filter(lifted_at__isnull=True)
    if strength:
        queryset = queryset.filter(strength=strength)
    return queryset


def auto_flag() -> list[PhoneBlock]:
    """Propose advance-only blocks for numbers whose history earns one.

    Skips any number that already has a block record, lifted or not: a lifted
    block is a merchant saying no to this exact suggestion.
    """
    known = set(PhoneBlock.objects.values_list("phone_number", flat=True))

    flagged = []
    for profile in PhoneRiskProfile.objects.filter(
        success_rate__lt=AUTO_FLAG_SUCCESS_RATE,
        returned_count__gte=AUTO_FLAG_MIN_RETURNS,
    ):
        if profile.phone_number in known:
            continue
        if profile.settled_orders < MIN_SETTLED_ORDERS:
            continue
        if not is_bd_mobile(profile.phone_number):
            continue
        flagged.append(
            block_phone(
                profile.phone_number,
                reason=(
                    f"Returned {profile.returned_count} of {profile.settled_orders} "
                    f"settled orders ({profile.success_rate}% delivered)"
                ),
                origin=PhoneBlock.Origin.AUTOMATIC,
            )
        )

    if flagged:
        logger.info("phone_blocklist.auto_flagged count=%d", len(flagged))
    return flagged
