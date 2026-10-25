from __future__ import annotations

from urllib.parse import quote

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone

from apps.common.utils.phone import e164_bd_mobile
from apps.marketing.models import SmsSubscriber

SMS_UNSUBSCRIBE_SALT = "marketing.sms.unsubscribe"
SMS_UNSUBSCRIBE_PATH = "/api/v1/public/marketing/sms-unsubscribe/{token}/"


@transaction.atomic
def sms_opt_in(*, phone: str) -> SmsSubscriber | None:
    """Record consent for a number. A later opt-in after an opt-out is fresh
    consent and reactivates it; one already active keeps its first consent
    time. None when the number is not a Bangladeshi mobile."""
    number = e164_bd_mobile(phone)
    if not number:
        return None
    now = timezone.now()
    subscriber, created = SmsSubscriber.objects.get_or_create(
        phone=number, defaults={"consented_at": now}
    )
    if not created and not subscriber.is_active:
        subscriber.is_active = True
        subscriber.unsubscribed_at = None
        subscriber.consented_at = now
        subscriber.save(
            update_fields=["is_active", "unsubscribed_at", "consented_at", "updated_at"]
        )
    return subscriber


def _opt_out(subscriber: SmsSubscriber) -> None:
    if subscriber.is_active:
        subscriber.is_active = False
        subscriber.unsubscribed_at = timezone.now()
        subscriber.save(update_fields=["is_active", "unsubscribed_at", "updated_at"])


@transaction.atomic
def sms_opt_out(*, phone: str) -> None:
    subscriber = SmsSubscriber.objects.filter(phone=e164_bd_mobile(phone)).first()
    if subscriber is not None:
        _opt_out(subscriber)


def is_sms_opted_in(phone: str) -> bool:
    number = e164_bd_mobile(phone)
    return bool(number) and SmsSubscriber.objects.filter(
        phone=number, is_active=True, consented_at__isnull=False
    ).exists()


def make_sms_unsubscribe_token(subscriber_id) -> str:
    return signing.Signer(salt=SMS_UNSUBSCRIBE_SALT).sign(str(subscriber_id))


def sms_unsubscribe_url(subscriber_id) -> str:
    token = quote(make_sms_unsubscribe_token(subscriber_id), safe="")
    return settings.PUBLIC_API_BASE_URL + SMS_UNSUBSCRIBE_PATH.format(token=token)


def sms_unsubscribe_links_available() -> bool:
    return bool(settings.PUBLIC_API_BASE_URL)


def sms_subscriber_for_token(token: str) -> SmsSubscriber | None:
    try:
        subscriber_id = signing.Signer(salt=SMS_UNSUBSCRIBE_SALT).unsign(token)
    except signing.BadSignature:
        return None
    return SmsSubscriber.objects.filter(id=subscriber_id).first()


@transaction.atomic
def sms_unsubscribe_by_token(token: str) -> bool:
    """False for a forged or unknown token; idempotent otherwise."""
    subscriber = sms_subscriber_for_token(token)
    if subscriber is None:
        return False
    _opt_out(subscriber)
    return True
