from __future__ import annotations

from django.db.models import QuerySet

from apps.marketing.models import NewsletterSubscriber


def subscribers_list(*, is_active: bool | None = None) -> QuerySet[NewsletterSubscriber]:
    queryset = NewsletterSubscriber.objects.all()
    if is_active is not None:
        queryset = queryset.filter(is_active=is_active)
    return queryset.order_by("-created_at")


def get_subscriber_by_email(email: str) -> NewsletterSubscriber | None:
    return NewsletterSubscriber.objects.filter(email__iexact=email).first()


def get_subscriber_by_id(subscriber_id) -> NewsletterSubscriber | None:
    return NewsletterSubscriber.objects.filter(id=subscriber_id).first()
