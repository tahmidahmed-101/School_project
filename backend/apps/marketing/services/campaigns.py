"""Newsletter and SMS campaigns: draft, schedule, send in batches, cancel.

Sending runs in `manage.py send_campaigns` (the sweeper loop), never inside a
request. Each run fixes the recipients of campaigns now due, then sends up to
CAMPAIGN_BATCH_SIZE emails (SMS_CAMPAIGN_BATCH_SIZE texts) over one SMTP
connection per campaign. Every copy is a `CampaignDelivery` row claimed before
it is sent, so a recipient gets one copy however often runs overlap or retry.

Marketing mail stays apart from account mail: it goes only to subscribers with
consent on record, skips the suppression list, and carries an unsubscribe
link and List-Unsubscribe headers. Password resets and verification codes
never consult any of it. SMS follows the same rules with its own opt-in list.
"""

from __future__ import annotations

import logging
import re
from collections import defaultdict
from uuid import UUID, uuid4

from django.conf import settings
from django.core.mail import EmailMessage
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.audit.services.audit import log_action
from apps.business.selectors.business_profile import get_business_profile
from apps.business.selectors.email_settings import email_state
from apps.business.services.email import (
    EmailDeliveryError,
    failure_reason,
    open_transport,
    send_email,
)
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.services.sms import (
    NOT_CONFIGURED,
    SmsDeliveryError,
    deliver_sms,
    sms_configured,
)
from apps.common.utils.phone import e164_bd_mobile
from apps.marketing.models import (
    CampaignDelivery,
    EmailCampaign,
    EmailSuppression,
    NewsletterSubscriber,
    SmsSubscriber,
)
from apps.marketing.selectors.campaigns import (
    MAX_DELIVERY_ATTEMPTS,
    campaign_has_work_left,
    claimable_deliveries,
    eligible_sms_subscribers,
    eligible_subscribers,
)
from apps.marketing.services.sms_subscribers import (
    sms_unsubscribe_links_available,
    sms_unsubscribe_url,
)
from apps.marketing.services.subscribers import (
    unsubscribe_links_available,
    unsubscribe_url,
)

logger = logging.getLogger("apps")

Status = EmailCampaign.Status
Channel = EmailCampaign.Channel
DeliveryStatus = CampaignDelivery.Status
EDITABLE_FIELDS = ("name", "subject", "body")
SMS_MAX_BODY = 640
_LINE_BREAK = re.compile(r"[\r\n]")
# Refusals that will not change on a retry: the address itself is bad.
PERMANENT_REASONS = frozenset({"recipient_refused"})
SNAPSHOT_CHUNK = 1000


def _fail(message: str, code: str):
    raise BusinessRuleViolationError(message, code=code)


def _clean(data: dict, channel: str = Channel.EMAIL) -> dict:
    cleaned: dict = {}
    if "name" in data:
        name = data["name"].strip()
        if not name:
            _fail("Give the campaign a name.", "invalid_name")
        cleaned["name"] = name
    if "subject" in data and channel == Channel.EMAIL:
        subject = data["subject"].strip()
        if not subject or _LINE_BREAK.search(subject):
            _fail("Enter a one-line subject.", "invalid_subject")
        cleaned["subject"] = subject
    if "body" in data:
        if not data["body"].strip():
            _fail("Write the message.", "invalid_body")
        if channel == Channel.SMS and len(data["body"].strip()) > SMS_MAX_BODY:
            _fail(f"A text message can be at most {SMS_MAX_BODY} characters.", "invalid_body")
        cleaned["body"] = data["body"].strip() if channel == Channel.SMS else data["body"]
    return cleaned


def _audit(actor, action: str, campaign: EmailCampaign, **metadata) -> None:
    log_action(
        actor=actor,
        action=f"campaign.{action}",
        target_type="EmailCampaign",
        target_id=campaign.id,
        metadata={"name": campaign.name, **metadata},
    )


@transaction.atomic
def create_campaign(*, data: dict, actor=None) -> EmailCampaign:
    channel = data.get("channel", Channel.EMAIL)
    if channel not in Channel.values:
        _fail("Choose email or SMS.", "invalid_channel")
    cleaned = _clean(data, channel)
    required = EDITABLE_FIELDS if channel == Channel.EMAIL else ("name", "body")
    if any(field not in cleaned for field in required):
        _fail("A campaign needs a name, a subject and a message.", "incomplete")
    who = actor if getattr(actor, "pk", None) else None
    campaign = EmailCampaign.objects.create(
        channel=channel, created_by=who, updated_by=who, **cleaned
    )
    _audit(actor, "created", campaign)
    return campaign


def _locked(campaign: EmailCampaign) -> EmailCampaign:
    EmailCampaign.objects.select_for_update().filter(pk=campaign.pk).exists()
    campaign.refresh_from_db()
    return campaign


def _require_status(campaign: EmailCampaign, *allowed: str, doing: str) -> None:
    if campaign.status not in allowed:
        _fail(
            f"A {campaign.get_status_display().lower()} campaign cannot be {doing}.",
            "invalid_campaign_status",
        )


@transaction.atomic
def update_campaign(*, campaign: EmailCampaign, data: dict, actor=None) -> EmailCampaign:
    """Drafts only: once scheduled, what was approved is what goes out.
    Unschedule it to edit again."""
    _locked(campaign)
    _require_status(campaign, Status.DRAFT, doing="edited")
    cleaned = _clean(data, campaign.channel)
    changed = [field for field, value in cleaned.items() if getattr(campaign, field) != value]
    for field in changed:
        setattr(campaign, field, cleaned[field])
    if changed:
        campaign.updated_by = actor if getattr(actor, "pk", None) else None
        campaign.save(update_fields=[*changed, "updated_by", "updated_at"])
        _audit(actor, "updated", campaign, changed=changed)
    return campaign


@transaction.atomic
def delete_campaign(*, campaign: EmailCampaign, actor=None) -> None:
    _locked(campaign)
    _require_status(campaign, Status.DRAFT, doing="deleted")
    _audit(actor, "deleted", campaign)
    campaign.delete()


def _ensure_can_send(channel: str = Channel.EMAIL) -> None:
    if channel == Channel.SMS:
        if not sms_configured():
            _fail(
                "SMS is not set up (Twilio account and sender number), so texts would not "
                "be delivered.",
                "sms_not_configured",
            )
        if not sms_unsubscribe_links_available():
            _fail(
                "Campaign texts need a working opt-out link: set PUBLIC_API_BASE_URL "
                "on the server.",
                "unsubscribe_url_missing",
            )
        return
    if not email_state()["sends_real_email"]:
        _fail(
            "No SMTP server is active, so campaign email would not be delivered. "
            "Set up outgoing email first.",
            "smtp_not_configured",
        )
    if not unsubscribe_links_available():
        _fail(
            "Campaign emails need a working unsubscribe link: set PUBLIC_API_BASE_URL "
            "on the server.",
            "unsubscribe_url_missing",
        )


@transaction.atomic
def schedule_campaign(*, campaign: EmailCampaign, send_at=None, actor=None) -> EmailCampaign:
    """Queue a draft. `send_at` defaults to now; the next sender run after it
    starts the campaign."""
    _locked(campaign)
    _require_status(campaign, Status.DRAFT, doing="scheduled")
    _ensure_can_send(campaign.channel)
    audience = (
        eligible_sms_subscribers() if campaign.channel == Channel.SMS else eligible_subscribers()
    )
    if not audience.exists():
        _fail("No subscriber can receive this campaign yet.", "no_recipients")
    campaign.status = Status.SCHEDULED
    campaign.scheduled_at = send_at or timezone.now()
    campaign.updated_by = actor if getattr(actor, "pk", None) else None
    campaign.save(update_fields=["status", "scheduled_at", "updated_by", "updated_at"])
    _audit(actor, "scheduled", campaign, scheduled_at=campaign.scheduled_at.isoformat())
    return campaign


@transaction.atomic
def unschedule_campaign(*, campaign: EmailCampaign, actor=None) -> EmailCampaign:
    _locked(campaign)
    _require_status(campaign, Status.SCHEDULED, doing="unscheduled")
    campaign.status = Status.DRAFT
    campaign.scheduled_at = None
    campaign.save(update_fields=["status", "scheduled_at", "updated_at"])
    _audit(actor, "unscheduled", campaign)
    return campaign


@transaction.atomic
def cancel_campaign(*, campaign: EmailCampaign, actor=None) -> EmailCampaign:
    """Stop a scheduled or sending campaign. Copies not yet sent are skipped;
    a batch already handed to the mail server cannot be recalled."""
    _locked(campaign)
    _require_status(campaign, Status.SCHEDULED, Status.SENDING, doing="cancelled")
    skipped = CampaignDelivery.objects.filter(
        campaign=campaign, status__in=(DeliveryStatus.PENDING, DeliveryStatus.FAILED)
    ).update(status=DeliveryStatus.SKIPPED, failure_reason="cancelled", updated_at=timezone.now())
    campaign.status = Status.CANCELLED
    campaign.cancelled_at = timezone.now()
    campaign.save(update_fields=["status", "cancelled_at", "updated_at"])
    _audit(actor, "cancelled", campaign, skipped=skipped)
    return campaign


def _footer_parts() -> tuple[str, str]:
    """(before, after) the unsubscribe link in the footer every copy carries:
    who sent it, why it arrived, how to stop it, and the postal address."""
    profile = get_business_profile()
    address = f"\n{profile.address_line}" if profile.address_line else ""
    before = (
        "\n\n--\n"
        f"You are receiving this because you subscribed to news from {profile.name}.\n"
        "Unsubscribe: "
    )
    return before, address


def _footer(link: str) -> str:
    before, after = _footer_parts()
    return f"{before}{link}{after}"


def sms_footer(link: str) -> str:
    return f"\nOpt out: {link}"


def sms_footer_length() -> int:
    """Characters the opt-out line adds, measured on a real-looking link."""
    return len(sms_footer(sms_unsubscribe_url(uuid4())))


def _send_sms_test(*, campaign: EmailCampaign, recipient: str, actor=None) -> dict:
    number = e164_bd_mobile(recipient)
    if not number:
        _fail("Enter a valid Bangladeshi mobile number.", "invalid_recipient")
    if not sms_configured():
        _fail("SMS is not set up.", "sms_not_configured")
    accepted, reason = True, ""
    body = f"[Test] {campaign.body}{sms_footer('(your own opt-out link)')}"
    try:
        deliver_sms(to=number, body=body)
    except SmsDeliveryError as exc:
        accepted, reason = False, exc.reason
    _audit(actor, "test_sent", campaign, accepted=accepted, reason=reason)
    return {"accepted": accepted, "reason": reason, "recipient": number}


def send_campaign_test(*, campaign: EmailCampaign, recipient: str, actor=None) -> dict:
    """One marked copy to a staff address or phone, outside the campaign: it
    creates no delivery row and its unsubscribe link is a placeholder."""
    if campaign.channel == Channel.SMS:
        return _send_sms_test(campaign=campaign, recipient=recipient, actor=actor)
    from django.core.exceptions import ValidationError
    from django.core.validators import validate_email

    recipient = recipient.strip()
    try:
        validate_email(recipient)
    except ValidationError:
        _fail("Enter a valid recipient email address.", "invalid_recipient")
    if not email_state()["sends_real_email"]:
        _fail("No SMTP server is active.", "smtp_not_configured")
    accepted, reason = True, ""
    try:
        send_email(
            subject=f"[Test] {campaign.subject}",
            body=campaign.body + _footer("(each recipient's own unsubscribe link)"),
            to=[recipient],
            purpose="campaign_test",
        )
    except EmailDeliveryError as exc:
        accepted, reason = False, exc.reason
    _audit(actor, "test_sent", campaign, accepted=accepted, reason=reason)
    return {"accepted": accepted, "reason": reason, "recipient": recipient}


# --- Sender -------------------------------------------------------------------


@transaction.atomic
def _start(campaign_id) -> bool:
    """Fix the recipients of a due campaign: one row per eligible subscriber,
    written in chunks. False if another run got there first."""
    campaign = EmailCampaign.objects.select_for_update().filter(pk=campaign_id).first()
    if campaign is None or campaign.status != Status.SCHEDULED:
        return False
    is_sms = campaign.channel == Channel.SMS
    source = eligible_sms_subscribers() if is_sms else eligible_subscribers()
    rows = source.values_list("id", "phone" if is_sms else "email").iterator(
        chunk_size=SNAPSHOT_CHUNK
    )
    batch: list[CampaignDelivery] = []
    seen: set[str] = set()
    for subscriber_id, address in rows:
        key = address.lower()
        if key in seen:
            continue
        seen.add(key)
        if is_sms:
            batch.append(
                CampaignDelivery(campaign=campaign, sms_subscriber_id=subscriber_id, phone=address)
            )
        else:
            batch.append(
                CampaignDelivery(campaign=campaign, subscriber_id=subscriber_id, email=address)
            )
        if len(batch) >= SNAPSHOT_CHUNK:
            CampaignDelivery.objects.bulk_create(batch, ignore_conflicts=True)
            batch = []
    if batch:
        CampaignDelivery.objects.bulk_create(batch, ignore_conflicts=True)
    campaign.status = Status.SENDING
    campaign.started_at = timezone.now()
    campaign.recipient_count = len(seen)
    campaign.save(update_fields=["status", "started_at", "recipient_count", "updated_at"])
    return True


def _claim(campaign_id, limit: int) -> list[UUID]:
    """Mark up to `limit` copies as being sent by this run. Rows another run
    holds are skipped, not waited on."""
    with transaction.atomic():
        ids = list(
            claimable_deliveries(campaign_id=campaign_id)
            .select_for_update(skip_locked=True)
            .values_list("pk", flat=True)[:limit]
        )
        CampaignDelivery.objects.filter(pk__in=ids).update(
            status=DeliveryStatus.SENDING, updated_at=timezone.now()
        )
    return ids


def _record(outcomes: dict[tuple[str, str], list]) -> None:
    """One UPDATE per outcome, not per copy."""
    now = timezone.now()
    for (status, reason), ids in outcomes.items():
        fields: dict = {
            "status": status,
            "failure_reason": reason,
            "attempts": F("attempts") + 1,
            "updated_at": now,
        }
        if status == DeliveryStatus.SENT:
            fields["sent_at"] = now
        if reason in PERMANENT_REASONS:
            fields["attempts"] = MAX_DELIVERY_ATTEMPTS
        CampaignDelivery.objects.filter(pk__in=ids).update(**fields)


def _send_sms_batch(campaign: EmailCampaign, ids: list) -> int:
    deliveries = list(
        CampaignDelivery.objects.filter(pk__in=ids).only("id", "phone", "sms_subscriber_id")
    )
    still_opted_in = set(
        SmsSubscriber.objects.filter(
            id__in=[d.sms_subscriber_id for d in deliveries if d.sms_subscriber_id],
            is_active=True,
        ).values_list("id", flat=True)
    )
    outcomes: dict[tuple[str, str], list] = defaultdict(list)
    sent = 0
    for delivery in deliveries:
        if delivery.sms_subscriber_id not in still_opted_in:
            outcomes[(DeliveryStatus.SKIPPED, "unsubscribed")].append(delivery.pk)
            continue
        body = campaign.body + sms_footer(sms_unsubscribe_url(delivery.sms_subscriber_id))
        try:
            deliver_sms(to=delivery.phone, body=body)
        except SmsDeliveryError as exc:
            outcomes[(DeliveryStatus.FAILED, exc.reason)].append(delivery.pk)
            if exc.reason == NOT_CONFIGURED:
                logger.warning("Campaign %s: SMS is not configured", campaign.pk)
            continue
        outcomes[(DeliveryStatus.SENT, "")].append(delivery.pk)
        sent += 1
    _record(outcomes)
    return sent


def _send_batch(campaign: EmailCampaign, ids: list) -> int:
    deliveries = list(
        CampaignDelivery.objects.filter(pk__in=ids).only("id", "email", "subscriber_id")
    )
    suppressed = set(
        EmailSuppression.objects.filter(
            email__in=[delivery.email.lower() for delivery in deliveries]
        ).values_list("email", flat=True)
    )
    still_subscribed = set(
        NewsletterSubscriber.objects.filter(
            id__in=[d.subscriber_id for d in deliveries if d.subscriber_id], is_active=True
        ).values_list("id", flat=True)
    )
    outcomes: dict[tuple[str, str], list] = defaultdict(list)
    to_send = []
    for delivery in deliveries:
        if delivery.email.lower() in suppressed:
            outcomes[(DeliveryStatus.SKIPPED, "suppressed")].append(delivery.pk)
        elif delivery.subscriber_id not in still_subscribed:
            outcomes[(DeliveryStatus.SKIPPED, "unsubscribed")].append(delivery.pk)
        else:
            to_send.append(delivery)

    sent = 0
    bounced: list[str] = []
    connection = None
    if to_send:
        before, after = _footer_parts()
        try:
            connection, from_email, _source = open_transport()
            connection.open()
        except Exception as exc:
            reason = failure_reason(exc)
            logger.warning("Campaign %s could not reach the mail server: %s", campaign.pk, reason)
            outcomes[(DeliveryStatus.FAILED, reason)].extend(d.pk for d in to_send)
            to_send, connection = [], None
        try:
            for delivery in to_send:
                link = unsubscribe_url(delivery.subscriber_id)
                body = f"{campaign.body}{before}{link}{after}"
                message = EmailMessage(
                    campaign.subject,
                    body,
                    from_email,
                    [delivery.email],
                    connection=connection,
                    headers={
                        "List-Unsubscribe": f"<{link}>",
                        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                    },
                )
                try:
                    message.send()
                except Exception as exc:
                    reason = failure_reason(exc)
                    outcomes[(DeliveryStatus.FAILED, reason)].append(delivery.pk)
                    if reason in PERMANENT_REASONS:
                        bounced.append(delivery.email.lower())
                    continue
                outcomes[(DeliveryStatus.SENT, "")].append(delivery.pk)
                sent += 1
        finally:
            if connection is not None:
                connection.close()

    _record(outcomes)
    for email in bounced:
        EmailSuppression.objects.get_or_create(
            email=email, defaults={"reason": EmailSuppression.Reason.BOUNCED}
        )
    return sent


def _finish_if_done(campaign_id) -> None:
    if campaign_has_work_left(campaign_id):
        return
    EmailCampaign.objects.filter(pk=campaign_id, status=Status.SENDING).update(
        status=Status.SENT, finished_at=timezone.now(), updated_at=timezone.now()
    )


def process_campaigns(*, batch_size: int | None = None, now=None) -> dict:
    """One sender run. Safe to run any number of times, and concurrently."""
    now = now or timezone.now()
    budgets: dict[str, int] = {
        Channel.EMAIL: batch_size if batch_size is not None else settings.CAMPAIGN_BATCH_SIZE,
        Channel.SMS: batch_size if batch_size is not None else settings.SMS_CAMPAIGN_BATCH_SIZE,
    }
    started = 0
    for campaign_id in EmailCampaign.objects.filter(
        status=Status.SCHEDULED, scheduled_at__lte=now
    ).values_list("pk", flat=True):
        if _start(campaign_id):
            started += 1
    sent: dict[str, int] = {Channel.EMAIL: 0, Channel.SMS: 0}
    for campaign in EmailCampaign.objects.filter(status=Status.SENDING).order_by("started_at"):
        channel = campaign.channel
        if budgets[channel] > 0:
            ids = _claim(campaign.pk, budgets[channel])
            if ids:
                budgets[channel] -= len(ids)
                send = _send_sms_batch if channel == Channel.SMS else _send_batch
                sent[channel] += send(campaign, ids)
        _finish_if_done(campaign.pk)
    return {"started": started, "sent": sent[Channel.EMAIL], "sms_sent": sent[Channel.SMS]}


# --- Suppression list -------------------------------------------------------


@transaction.atomic
def add_suppression(*, email: str, note: str = "", actor=None) -> EmailSuppression:
    from django.core.exceptions import ValidationError
    from django.core.validators import validate_email

    email = email.strip().lower()
    try:
        validate_email(email)
    except ValidationError:
        _fail("Enter a valid email address.", "invalid_email")
    suppression, created = EmailSuppression.objects.get_or_create(
        email=email,
        defaults={
            "reason": EmailSuppression.Reason.MANUAL,
            "note": note.strip()[:255],
            "created_by": actor if getattr(actor, "pk", None) else None,
        },
    )
    if not created:
        _fail("This address is already suppressed.", "suppression_already_exists")
    log_action(
        actor=actor,
        action="campaign.suppression_added",
        target_type="EmailSuppression",
        target_id=suppression.id,
    )
    return suppression


@transaction.atomic
def remove_suppression(*, suppression: EmailSuppression, actor=None) -> None:
    """Lifts the block. An unsubscribed subscriber stays unsubscribed: only
    they can opt back in, by subscribing again."""
    log_action(
        actor=actor,
        action="campaign.suppression_removed",
        target_type="EmailSuppression",
        target_id=suppression.id,
        metadata={"reason": suppression.reason},
    )
    suppression.delete()
