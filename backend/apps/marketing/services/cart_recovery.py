"""One reminder text to a shopper who left a cart behind.

Runs from `manage.py send_cart_recovery` (the sweeper loop). Off until staff
switch it on in business settings, because every text costs money. A cart is
claimed (`recovery_sent_at`) before its text goes out, so it is never texted
twice; a send that fails for a reason that may pass releases the claim.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from apps.business.selectors.business_profile import get_business_profile
from apps.common.services.sms import (
    NETWORK_ERROR,
    PROVIDER_ERROR,
    SmsDeliveryError,
    deliver_sms,
    sms_configured,
)
from apps.common.utils.dates import dhaka_day_start
from apps.common.utils.phone import e164_bd_mobile
from apps.marketing.models import SmsSubscriber
from apps.orders.models import SalesOrder
from apps.orders.selectors.sales_orders import (
    phone_reminded_since,
    recovery_candidates,
    shopper_ordered_since,
)

logger = logging.getLogger("apps")

CHECKOUT_PATH = "/checkout"
_TRANSIENT = frozenset({PROVIDER_ERROR, NETWORK_ERROR})


def recovery_message(*, shop: str, link: str) -> str:
    return f"{shop}: কার্টে পণ্য রয়ে গেছে। অর্ডারটা শেষ করুন: {link}"


def _off_reason() -> str:
    if not get_business_profile().cart_recovery_enabled:
        return "switched_off"
    if not settings.STOREFRONT_BASE_URL:
        return "storefront_url_missing"
    if not sms_configured():
        return "sms_not_configured"
    return ""


def _opted_out(number: str) -> bool:
    return SmsSubscriber.objects.filter(phone=number, is_active=False).exists()


def send_cart_recovery(*, now=None) -> dict:
    """One run. Safe to repeat and to overlap. `reason` says why nothing was
    attempted, empty when the run went ahead."""
    now = now or timezone.now()
    off = _off_reason()
    if off:
        return {"sent": 0, "reason": off}

    sent_today = SalesOrder.objects.filter(recovery_sent_at__gte=dhaka_day_start(now)).count()
    room = settings.CART_RECOVERY_DAILY_CAP - sent_today
    max_age = timedelta(hours=settings.CART_RECOVERY_MAX_AGE_HOURS)
    candidates = recovery_candidates(
        idle=timedelta(hours=settings.CART_RECOVERY_IDLE_HOURS), max_age=max_age, now=now
    )
    shop = get_business_profile().name
    link = settings.STOREFRONT_BASE_URL + CHECKOUT_PATH
    sent = 0
    for cart in candidates.iterator():
        if sent >= room:
            break
        number = e164_bd_mobile(cart.contact_phone)
        if (
            not number
            or _opted_out(number)
            or shopper_ordered_since(cart)
            or phone_reminded_since(cart.contact_phone, now - max_age)
        ):
            continue
        claimed = SalesOrder.objects.filter(pk=cart.pk, recovery_sent_at__isnull=True).update(
            recovery_sent_at=now
        )
        if not claimed:
            continue
        try:
            deliver_sms(to=number, body=recovery_message(shop=shop, link=link))
        except SmsDeliveryError as exc:
            if exc.reason in _TRANSIENT:
                SalesOrder.objects.filter(pk=cart.pk).update(recovery_sent_at=None)
                logger.warning("Cart recovery stopped: %s", exc.reason)
                break
            logger.warning("Cart recovery text refused for cart %s: %s", cart.pk, exc.reason)
            continue
        sent += 1
    return {"sent": sent, "reason": ""}
