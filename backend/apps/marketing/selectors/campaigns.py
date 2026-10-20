from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from datetime import timedelta
from uuid import UUID

from django.db.models import Count, Exists, OuterRef, Q, QuerySet
from django.db.models.functions import Lower
from django.utils import timezone

from apps.marketing.models import (
    CampaignDelivery,
    EmailCampaign,
    EmailSuppression,
    NewsletterSubscriber,
)

# A recipient gets at most this many tries; a refused address gets one.
MAX_DELIVERY_ATTEMPTS = 3
# A claimed copy not finished in this long died with its sender, and may be
# claimed again.
STALE_SENDING_AFTER = timedelta(minutes=15)


def campaigns_list(*, status: str | None = None) -> QuerySet[EmailCampaign]:
    queryset = EmailCampaign.objects.all()
    if status:
        queryset = queryset.filter(status=status)
    return queryset


def get_campaign_by_id(campaign_id: str | UUID) -> EmailCampaign | None:
    return EmailCampaign.objects.filter(id=campaign_id).first()


def eligible_subscribers() -> QuerySet[NewsletterSubscriber]:
    """Who a campaign may go to: subscribed, with consent on record, and not
    on the suppression list (compared case-insensitively)."""
    suppressed = EmailSuppression.objects.filter(email=OuterRef("email_lower"))
    return (
        NewsletterSubscriber.objects.filter(is_active=True, consented_at__isnull=False)
        .annotate(email_lower=Lower("email"), is_suppressed=Exists(suppressed))
        .filter(is_suppressed=False)
    )


def audience_summary() -> dict:
    active = NewsletterSubscriber.objects.filter(is_active=True).count()
    return {
        "active_subscribers": active,
        "eligible_recipients": eligible_subscribers().count(),
        "suppressed_addresses": EmailSuppression.objects.count(),
    }


def delivery_counts(campaign_ids: Iterable[UUID]) -> dict[UUID, dict[str, int]]:
    """Copies per status for each campaign, in one grouped query."""
    counts: dict[UUID, dict[str, int]] = defaultdict(
        lambda: dict.fromkeys(CampaignDelivery.Status.values, 0)
    )
    rows = (
        CampaignDelivery.objects.filter(campaign_id__in=list(campaign_ids))
        .values("campaign_id", "status")
        .annotate(total=Count("id"))
    )
    for row in rows:
        counts[row["campaign_id"]][row["status"]] = row["total"]
    return counts


def deliveries_list(*, campaign: EmailCampaign, status: str | None = None):
    queryset = CampaignDelivery.objects.filter(campaign=campaign)
    if status:
        queryset = queryset.filter(status=status)
    return queryset


def claimable_deliveries(*, campaign_id: UUID, now=None) -> QuerySet[CampaignDelivery]:
    """Copies a run may send: pending, failed with tries left, or claimed by a
    sender that never came back."""
    now = now or timezone.now()
    return CampaignDelivery.objects.filter(
        Q(status__in=(CampaignDelivery.Status.PENDING, CampaignDelivery.Status.FAILED))
        | Q(status=CampaignDelivery.Status.SENDING, updated_at__lt=now - STALE_SENDING_AFTER),
        campaign_id=campaign_id,
        attempts__lt=MAX_DELIVERY_ATTEMPTS,
    ).order_by("created_at")


def campaign_has_work_left(campaign_id: UUID, *, now=None) -> bool:
    now = now or timezone.now()
    in_flight = CampaignDelivery.objects.filter(
        campaign_id=campaign_id,
        status=CampaignDelivery.Status.SENDING,
        updated_at__gte=now - STALE_SENDING_AFTER,
    )
    return claimable_deliveries(campaign_id=campaign_id, now=now).exists() or in_flight.exists()


def suppressions_list(*, reason: str | None = None) -> QuerySet[EmailSuppression]:
    queryset = EmailSuppression.objects.all()
    if reason:
        queryset = queryset.filter(reason=reason)
    return queryset


def get_suppression_by_id(suppression_id: str | UUID) -> EmailSuppression | None:
    return EmailSuppression.objects.filter(id=suppression_id).first()
