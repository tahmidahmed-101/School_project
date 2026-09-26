from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.common.exceptions import BusinessRuleViolationError, DomainError
from apps.marketing.models import NewsletterSubscriber
from apps.marketing.selectors.subscribers import get_subscriber_by_email


@transaction.atomic
def subscribe(*, email: str) -> NewsletterSubscriber:
    subscriber = get_subscriber_by_email(email)
    if subscriber is not None:
        if subscriber.is_active:
            raise BusinessRuleViolationError(
                "This email is already subscribed.", code="already_subscribed"
            )
        subscriber.is_active = True
        subscriber.unsubscribed_at = None
        subscriber.save(update_fields=["is_active", "unsubscribed_at", "updated_at"])
        return subscriber
    return NewsletterSubscriber.objects.create(email=email)


@transaction.atomic
def unsubscribe(*, email: str) -> NewsletterSubscriber:
    subscriber = get_subscriber_by_email(email)
    if subscriber is None or not subscriber.is_active:
        raise DomainError("This email is not currently subscribed.", code="not_subscribed")
    subscriber.is_active = False
    subscriber.unsubscribed_at = timezone.now()
    subscriber.save(update_fields=["is_active", "unsubscribed_at", "updated_at"])
    return subscriber
