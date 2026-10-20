from __future__ import annotations

from urllib.parse import quote

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone

from apps.common.exceptions import BusinessRuleViolationError
from apps.marketing.models import EmailSuppression, NewsletterSubscriber
from apps.marketing.selectors.subscribers import get_subscriber_by_email

UNSUBSCRIBE_SALT = "marketing.newsletter.unsubscribe"
UNSUBSCRIBE_PATH = "/api/v1/public/marketing/unsubscribe/{token}/"


@transaction.atomic
def subscribe(*, email: str) -> NewsletterSubscriber:
    """A sign-up is consent: it is recorded, and lifts an earlier unsubscribe
    from the suppression list. A bounced or staff-blocked address stays
    blocked — subscribing again does not make it deliverable."""
    now = timezone.now()
    subscriber = get_subscriber_by_email(email)
    if subscriber is not None:
        if subscriber.is_active:
            raise BusinessRuleViolationError(
                "This email is already subscribed.", code="already_subscribed"
            )
        subscriber.is_active = True
        subscriber.unsubscribed_at = None
        subscriber.consented_at = now
        subscriber.save(
            update_fields=["is_active", "unsubscribed_at", "consented_at", "updated_at"]
        )
    else:
        subscriber = NewsletterSubscriber.objects.create(email=email, consented_at=now)
    EmailSuppression.objects.filter(
        email=subscriber.email.lower(), reason=EmailSuppression.Reason.UNSUBSCRIBED
    ).delete()
    return subscriber


def _opt_out(subscriber: NewsletterSubscriber) -> None:
    if subscriber.is_active:
        subscriber.is_active = False
        subscriber.unsubscribed_at = timezone.now()
        subscriber.save(update_fields=["is_active", "unsubscribed_at", "updated_at"])
    # Also suppressed, so a campaign already under way skips them, and an
    # address re-added by staff is not mailed against its owner's choice.
    EmailSuppression.objects.get_or_create(
        email=subscriber.email.lower(),
        defaults={"reason": EmailSuppression.Reason.UNSUBSCRIBED},
    )


@transaction.atomic
def unsubscribe(*, email: str) -> None:
    """Answers the same whether or not the address was subscribed, so the
    endpoint cannot be used to find out who is."""
    subscriber = get_subscriber_by_email(email)
    if subscriber is not None:
        _opt_out(subscriber)


def make_unsubscribe_token(subscriber_id) -> str:
    """Signed with SECRET_KEY, so only this server can mint one. It names the
    subscriber, not their address, and does not expire: a link in an old email
    must keep working."""
    return signing.Signer(salt=UNSUBSCRIBE_SALT).sign(str(subscriber_id))


def unsubscribe_url(subscriber_id) -> str:
    token = quote(make_unsubscribe_token(subscriber_id), safe="")
    if settings.NEWSLETTER_UNSUBSCRIBE_URL:
        return settings.NEWSLETTER_UNSUBSCRIBE_URL.replace("{token}", token)
    return settings.PUBLIC_API_BASE_URL + UNSUBSCRIBE_PATH.format(token=token)


def unsubscribe_links_available() -> bool:
    return bool(settings.NEWSLETTER_UNSUBSCRIBE_URL or settings.PUBLIC_API_BASE_URL)


def subscriber_for_token(token: str) -> NewsletterSubscriber | None:
    try:
        subscriber_id = signing.Signer(salt=UNSUBSCRIBE_SALT).unsign(token)
    except signing.BadSignature:
        return None
    return NewsletterSubscriber.objects.filter(id=subscriber_id).first()


@transaction.atomic
def unsubscribe_by_token(token: str) -> bool:
    """The one-click unsubscribe behind every campaign email. Idempotent.
    False for a forged or unknown token."""
    subscriber = subscriber_for_token(token)
    if subscriber is None:
        return False
    _opt_out(subscriber)
    return True
