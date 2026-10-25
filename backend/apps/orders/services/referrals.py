from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.audit.services.audit import log_action
from apps.business.selectors.business_profile import get_business_profile
from apps.common.exceptions import DomainError
from apps.common.utils.phone import local_bd_mobile
from apps.orders.models import Coupon, Referral, SalesOrder

REWARD_VALID_DAYS = 180
SHARE_CODE_LENGTH = 7
REWARD_CODE_LENGTH = 12
# No 0/O/1/I/L: codes get read out and typed by hand.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


@dataclass(frozen=True)
class ReferralAmounts:
    friend_discount: Decimal
    reward: Decimal


def referral_amounts() -> ReferralAmounts | None:
    """The programme's amounts, or None while it is off (either one unset or 0)."""
    profile = get_business_profile()
    friend = profile.referral_friend_discount or Decimal("0")
    reward = profile.referral_reward_amount or Decimal("0")
    if friend <= 0 or reward <= 0:
        return None
    return ReferralAmounts(friend_discount=friend, reward=reward)


def _random_code(*, prefix: str = "", length: int) -> str:
    while True:
        code = prefix + "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))
        if not Coupon.objects.filter(code__iexact=code).exists():
            return code


def referral_code_for(user) -> Coupon | None:
    """The customer's shareable code, made on first use. None while the
    programme is off."""
    amounts = referral_amounts()
    if amounts is None:
        return None
    for _ in range(3):
        existing = Coupon.objects.filter(referrer=user).first()
        if existing is not None:
            return existing
        try:
            with transaction.atomic():
                return Coupon.objects.create(
                    code=_random_code(length=SHARE_CODE_LENGTH),
                    discount_type=Coupon.DiscountType.FIXED,
                    value=amounts.friend_discount,
                    referrer=user,
                )
        except IntegrityError:
            continue
    raise DomainError("Could not make a referral code. Try again.", code="referral_code_busy")


def is_self_referral(referrer, *, customer, phone: str, email: str) -> bool:
    if customer is not None and customer.id == referrer.id:
        return True
    own_phone = local_bd_mobile(referrer.phone)
    shopper_phones = {local_bd_mobile(p) for p in (phone, getattr(customer, "phone", "")) if p}
    if own_phone and own_phone in shopper_phones:
        return True
    return bool(email and referrer.email and email.lower() == referrer.email.lower())


def record_referral(order: SalesOrder) -> None:
    """Called when the order is placed: from then on the referral waits for delivery."""
    coupon = order.coupon
    if coupon is None or coupon.referrer_id is None:
        return
    amounts = referral_amounts()
    if amounts is None:
        return
    Referral.objects.create(
        referrer_id=coupon.referrer_id, order=order, reward_amount=amounts.reward
    )


@transaction.atomic
def reward_referral(order: SalesOrder) -> Referral | None:
    """Call after an order becomes delivered. Pays the referrer once: only a
    pending referral is touched, under a row lock, so a repeat is a no-op."""
    referral = (
        Referral.objects.select_for_update()
        .select_related("referrer", "order__customer")
        .filter(order=order, status=Referral.Status.PENDING)
        .first()
    )
    if referral is None:
        return None
    if is_self_referral(
        referral.referrer,
        customer=order.customer,
        phone=order.contact_phone,
        email=order.contact_email,
    ):
        referral.status = Referral.Status.VOID
        referral.save(update_fields=["status", "updated_at"])
        return referral

    now = timezone.now()
    referral.reward_coupon = Coupon.objects.create(
        code=_random_code(prefix="RW-", length=REWARD_CODE_LENGTH),
        discount_type=Coupon.DiscountType.FIXED,
        value=referral.reward_amount,
        usage_limit=1,
        expires_at=now + timedelta(days=REWARD_VALID_DAYS),
    )
    referral.status = Referral.Status.REWARDED
    referral.rewarded_at = now
    referral.save(update_fields=["reward_coupon", "status", "rewarded_at", "updated_at"])
    log_action(
        action="referral.rewarded",
        target_type="Referral",
        target_id=referral.id,
        metadata={"order_id": str(order.id), "referrer_id": str(referral.referrer_id)},
    )
    return referral


def void_referral(order: SalesOrder) -> None:
    """Call when an order is cancelled before delivery."""
    Referral.objects.filter(order=order, status=Referral.Status.PENDING).update(
        status=Referral.Status.VOID, updated_at=timezone.now()
    )
