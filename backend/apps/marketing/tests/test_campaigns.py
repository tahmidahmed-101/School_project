from __future__ import annotations

import smtplib
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.core import mail
from django.core.cache import cache
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.services.authentication import request_password_reset
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user
from apps.marketing.models import (
    CampaignDelivery,
    EmailCampaign,
    EmailSuppression,
    NewsletterSubscriber,
)
from apps.marketing.selectors.campaigns import MAX_DELIVERY_ATTEMPTS
from apps.marketing.services.campaigns import (
    cancel_campaign,
    create_campaign,
    process_campaigns,
    schedule_campaign,
)
from apps.marketing.services.subscribers import make_unsubscribe_token, subscribe

pytestmark = pytest.mark.django_db

URL = "/api/v1/admin/marketing/campaigns/"
SUPPRESSIONS_URL = "/api/v1/admin/marketing/suppressions/"
API_BASE = "https://api.example.test"
EMAIL_STATE = "apps.marketing.services.campaigns.email_state"
DRAFT = {"name": "October news", "subject": "New arrivals", "body": "Hello!\n\nSee what's new."}


@pytest.fixture(autouse=True)
def _setup(settings):
    settings.PUBLIC_API_BASE_URL = API_BASE
    settings.NEWSLETTER_UNSUBSCRIBE_URL = ""
    cache.clear()


@pytest.fixture
def smtp_active():
    """Treat the in-memory test backend as a real mail server, so campaigns
    may be scheduled; every copy lands in `mail.outbox`."""
    with patch(EMAIL_STATE, return_value={"sends_real_email": True}):
        yield


@pytest.fixture
def admin_client(api_client):
    api_client.force_authenticate(user=create_user(email="owner@example.com", role=UserRole.ADMIN))
    return api_client


def _subscribers(count, prefix="reader"):
    return [subscribe(email=f"{prefix}{index}@example.com") for index in range(count)]


def _scheduled(**overrides):
    campaign = create_campaign(data={**DRAFT, **overrides})
    return schedule_campaign(campaign=campaign)


def _recipients():
    return sorted(message.to[0] for message in mail.outbox)


# --- Permissions ------------------------------------------------------------


def test_marketing_view_reads_campaigns_and_marketing_manage_runs_them(api_client, smtp_active):
    staff = create_user(email="viewer@example.com", role=UserRole.STAFF)
    set_staff_permission(
        staff_user=staff, permission_code=StaffPermissionCode.MARKETING_VIEW, is_enabled=True
    )
    campaign = create_campaign(data=DRAFT)
    api_client.force_authenticate(user=staff)

    assert api_client.get(URL).status_code == 200
    assert api_client.get(f"{URL}{campaign.id}/").status_code == 200
    assert api_client.get(f"{URL}audience/").status_code == 200
    assert api_client.get(f"{URL}{campaign.id}/deliveries/").status_code == 200
    assert api_client.post(URL, DRAFT, format="json").status_code == 403
    assert api_client.patch(f"{URL}{campaign.id}/", {"name": "x"}, format="json").status_code == 403
    assert api_client.post(f"{URL}{campaign.id}/schedule/", {}, format="json").status_code == 403
    assert api_client.post(f"{URL}{campaign.id}/test/", {}, format="json").status_code == 403
    assert api_client.post(SUPPRESSIONS_URL, {"email": "a@b.com"}, format="json").status_code == 403


def test_customers_cannot_reach_campaigns(api_client):
    api_client.force_authenticate(user=create_user(email="shopper@example.com"))

    assert api_client.get(URL).status_code == 403


# --- Drafts -------------------------------------------------------------------


def test_a_draft_is_created_edited_and_deleted(admin_client):
    created = admin_client.post(URL, DRAFT, format="json")
    campaign_id = created.data["data"]["id"]

    edited = admin_client.patch(f"{URL}{campaign_id}/", {"subject": "Fresh in"}, format="json")
    deleted = admin_client.delete(f"{URL}{campaign_id}/")

    assert created.status_code == 201
    assert created.data["data"]["status"] == "draft"
    assert edited.data["data"]["subject"] == "Fresh in"
    assert deleted.status_code == 204


@pytest.mark.parametrize(
    ("payload", "code"),
    [
        ({"name": "Only a name"}, "incomplete"),
        ({**DRAFT, "subject": "Line one\nBcc: everyone@example.com"}, "invalid_subject"),
        ({**DRAFT, "body": "   "}, "invalid_body"),
    ],
)
def test_invalid_drafts_are_refused(admin_client, payload, code):
    response = admin_client.post(URL, payload, format="json")

    assert response.data["error"]["code"] == code
    assert not EmailCampaign.objects.exists()


def test_a_scheduled_campaign_cannot_be_edited_until_unscheduled(admin_client, smtp_active):
    _subscribers(1)
    campaign = _scheduled()

    refused = admin_client.patch(f"{URL}{campaign.id}/", {"subject": "Changed"}, format="json")
    admin_client.post(f"{URL}{campaign.id}/unschedule/", {}, format="json")
    allowed = admin_client.patch(f"{URL}{campaign.id}/", {"subject": "Changed"}, format="json")

    assert refused.data["error"]["code"] == "invalid_campaign_status"
    assert allowed.status_code == 200


# --- Scheduling guards -------------------------------------------------------------


def test_scheduling_needs_a_real_mail_server(admin_client):
    _subscribers(1)
    campaign = create_campaign(data=DRAFT)

    response = admin_client.post(f"{URL}{campaign.id}/schedule/", {}, format="json")

    assert response.data["error"]["code"] == "smtp_not_configured"


def test_scheduling_needs_a_working_unsubscribe_link(admin_client, settings, smtp_active):
    settings.PUBLIC_API_BASE_URL = ""
    _subscribers(1)
    campaign = create_campaign(data=DRAFT)

    response = admin_client.post(f"{URL}{campaign.id}/schedule/", {}, format="json")

    assert response.data["error"]["code"] == "unsubscribe_url_missing"


def test_scheduling_needs_someone_to_send_to(admin_client, smtp_active):
    campaign = create_campaign(data=DRAFT)

    response = admin_client.post(f"{URL}{campaign.id}/schedule/", {}, format="json")

    assert response.data["error"]["code"] == "no_recipients"


def test_a_campaign_scheduled_for_later_waits(smtp_active):
    _subscribers(1)
    campaign = create_campaign(data=DRAFT)
    schedule_campaign(campaign=campaign, send_at=timezone.now() + timedelta(hours=2))

    process_campaigns()

    campaign.refresh_from_db()
    assert campaign.status == "scheduled"
    assert mail.outbox == []


# --- Recipients and content ----------------------------------------------------------


def test_only_consenting_unsuppressed_subscribers_receive_it(smtp_active):
    _subscribers(2)
    subscribe(email="left@example.com")
    NewsletterSubscriber.objects.filter(email="left@example.com").update(is_active=False)
    subscribe(email="Blocked@Example.com")
    EmailSuppression.objects.create(email="blocked@example.com", reason="manual")
    NewsletterSubscriber.objects.create(email="no-consent@example.com")
    campaign = _scheduled()

    process_campaigns()

    assert _recipients() == ["reader0@example.com", "reader1@example.com"]
    campaign.refresh_from_db()
    assert (campaign.status, campaign.recipient_count) == ("sent", 2)


def test_every_copy_carries_its_own_unsubscribe_link_and_headers(smtp_active):
    _subscribers(1)
    _scheduled()

    process_campaigns()

    message = mail.outbox[0]
    assert message.subject == "New arrivals"
    assert message.body.startswith("Hello!")
    assert f"{API_BASE}/api/v1/public/marketing/unsubscribe/" in message.body
    assert "You are receiving this because you subscribed" in message.body
    assert message.extra_headers["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    assert message.extra_headers["List-Unsubscribe"].startswith(f"<{API_BASE}/")


# --- Batching, idempotency, concurrency --------------------------------------------


def test_a_large_campaign_goes_out_in_batches_with_one_copy_each(smtp_active):
    _subscribers(5)
    campaign = _scheduled()

    process_campaigns(batch_size=2)
    first = len(mail.outbox)
    process_campaigns(batch_size=2)
    process_campaigns(batch_size=2)
    process_campaigns(batch_size=2)

    campaign.refresh_from_db()
    assert first == 2
    assert len(_recipients()) == len(set(_recipients())) == 5
    assert campaign.status == "sent"


def test_running_the_sender_again_sends_nothing_twice(smtp_active):
    _subscribers(3)
    _scheduled()

    process_campaigns()
    process_campaigns()
    process_campaigns()

    assert len(mail.outbox) == 3


def test_copies_another_run_is_sending_are_left_alone_until_stale(smtp_active):
    _subscribers(2)
    campaign = _scheduled()
    process_campaigns(batch_size=0)  # start: fixes recipients, sends nothing
    CampaignDelivery.objects.update(status="sending", updated_at=timezone.now())

    process_campaigns()
    assert mail.outbox == []

    CampaignDelivery.objects.update(updated_at=timezone.now() - timedelta(hours=1))
    process_campaigns()
    campaign.refresh_from_db()
    assert len(mail.outbox) == 2
    assert campaign.status == "sent"


def test_someone_who_unsubscribes_mid_campaign_is_skipped(smtp_active):
    first, second = _subscribers(2)
    _scheduled()
    process_campaigns(batch_size=0)

    client_token = make_unsubscribe_token(second.id)
    from django.test import Client

    Client().post(f"/api/v1/public/marketing/unsubscribe/{client_token}/")
    process_campaigns()

    assert _recipients() == [first.email]
    assert CampaignDelivery.objects.get(email=second.email).status == "skipped"


def test_cancelling_skips_every_copy_not_yet_sent(smtp_active):
    _subscribers(4)
    campaign = _scheduled()
    process_campaigns(batch_size=1)

    cancel_campaign(campaign=campaign)
    process_campaigns()

    campaign.refresh_from_db()
    assert campaign.status == "cancelled"
    assert len(mail.outbox) == 1
    assert CampaignDelivery.objects.filter(status="skipped").count() == 3


# --- Failures and retries ------------------------------------------------------------


def test_a_refused_address_fails_for_good_and_is_suppressed(smtp_active):
    _subscribers(2)
    campaign = _scheduled()
    real_send = mail.EmailMessage.send

    def send(message, *args, **kwargs):
        if message.to == ["reader0@example.com"]:
            raise smtplib.SMTPRecipientsRefused({"reader0@example.com": (550, b"no such user")})
        return real_send(message, *args, **kwargs)

    with patch.object(mail.EmailMessage, "send", send):
        process_campaigns()
        process_campaigns()

    refused = CampaignDelivery.objects.get(email="reader0@example.com")
    assert (refused.status, refused.failure_reason) == ("failed", "recipient_refused")
    assert refused.attempts == MAX_DELIVERY_ATTEMPTS
    assert EmailSuppression.objects.get(email="reader0@example.com").reason == "bounced"
    assert _recipients() == ["reader1@example.com"]
    campaign.refresh_from_db()
    assert campaign.status == "sent"


def test_an_unreachable_server_fails_the_batch_and_a_later_run_retries_it(smtp_active):
    _subscribers(2)
    _scheduled()

    with patch(
        "apps.marketing.services.campaigns.open_transport", side_effect=ConnectionRefusedError()
    ):
        process_campaigns()
    failed = list(CampaignDelivery.objects.values_list("status", "failure_reason", "attempts"))
    process_campaigns()

    assert failed == [("failed", "connection_failed", 1)] * 2
    assert len(mail.outbox) == 2


def test_a_copy_stops_being_retried_after_its_last_attempt(smtp_active):
    _subscribers(1)
    campaign = _scheduled()

    with patch("apps.marketing.services.campaigns.open_transport", side_effect=TimeoutError()):
        for _ in range(MAX_DELIVERY_ATTEMPTS + 2):
            process_campaigns()

    delivery = CampaignDelivery.objects.get()
    campaign.refresh_from_db()
    assert (delivery.attempts, delivery.failure_reason) == (MAX_DELIVERY_ATTEMPTS, "timeout")
    assert campaign.status == "sent"


# --- Unsubscribe ----------------------------------------------------------------


def test_the_unsubscribe_link_asks_first_then_unsubscribes(client):
    (subscriber,) = _subscribers(1)
    url = f"/api/v1/public/marketing/unsubscribe/{make_unsubscribe_token(subscriber.id)}/"

    page = client.get(url)
    subscriber.refresh_from_db()
    assert page.status_code == 200
    assert subscriber.is_active is True
    assert subscriber.email.encode() not in page.content

    done = client.post(url, {"List-Unsubscribe": "One-Click"})
    subscriber.refresh_from_db()
    assert done.status_code == 200
    assert b"You are unsubscribed" in done.content
    assert subscriber.is_active is False
    assert EmailSuppression.objects.get(email=subscriber.email).reason == "unsubscribed"


def test_a_forged_unsubscribe_token_is_refused(client):
    (subscriber,) = _subscribers(1)

    response = client.post(f"/api/v1/public/marketing/unsubscribe/{subscriber.id}:forged/")

    subscriber.refresh_from_db()
    assert response.status_code == 404
    assert subscriber.is_active is True


def test_unsubscribing_by_email_no_longer_reveals_who_is_subscribed(api_client):
    _subscribers(1)

    known = api_client.post(
        "/api/v1/public/marketing/unsubscribe/", {"email": "reader0@example.com"}
    )
    unknown = api_client.post("/api/v1/public/marketing/unsubscribe/", {"email": "x@example.com"})

    assert known.status_code == unknown.status_code == 200
    assert known.data == unknown.data


def test_subscribing_again_lifts_an_unsubscribe_but_not_a_bounce():
    subscribe(email="back@example.com")
    from apps.marketing.services.subscribers import unsubscribe

    unsubscribe(email="back@example.com")
    subscribe(email="back@example.com")
    EmailSuppression.objects.create(email="bounced@example.com", reason="bounced")
    subscribe(email="bounced@example.com")

    assert not EmailSuppression.objects.filter(email="back@example.com").exists()
    assert EmailSuppression.objects.filter(email="bounced@example.com").exists()


def test_account_email_ignores_the_marketing_suppression_list():
    create_user(email="suppressed@example.com")
    EmailSuppression.objects.create(email="suppressed@example.com", reason="unsubscribed")

    request_password_reset("suppressed@example.com")

    assert [message.to for message in mail.outbox] == [["suppressed@example.com"]]


# --- Suppressions API -----------------------------------------------------------------


def test_staff_block_and_unblock_an_address(admin_client):
    added = admin_client.post(
        SUPPRESSIONS_URL, {"email": "Spam-Trap@Example.com", "note": "complaint"}, format="json"
    )
    duplicate = admin_client.post(
        SUPPRESSIONS_URL, {"email": "spam-trap@example.com"}, format="json"
    )
    removed = admin_client.delete(f"{SUPPRESSIONS_URL}{added.data['data']['id']}/")

    assert added.data["data"]["email"] == "spam-trap@example.com"
    assert duplicate.status_code == 409
    assert removed.status_code == 204


# --- Test copy, stats and queries ----------------------------------------------------


def test_a_test_copy_goes_only_to_the_requester(admin_client, smtp_active):
    _subscribers(2)
    campaign = create_campaign(data=DRAFT)

    response = admin_client.post(f"{URL}{campaign.id}/test/", {}, format="json")

    assert response.data["data"] == {
        "accepted": True,
        "reason": "",
        "recipient": "owner@example.com",
    }
    assert [message.to for message in mail.outbox] == [["owner@example.com"]]
    assert mail.outbox[0].subject == "[Test] New arrivals"
    assert not CampaignDelivery.objects.exists()


def test_the_campaign_reports_its_delivery_counts(admin_client, smtp_active):
    _subscribers(3)
    campaign = _scheduled()
    process_campaigns(batch_size=2)

    data = admin_client.get(f"{URL}{campaign.id}/").data["data"]
    deliveries = admin_client.get(f"{URL}{campaign.id}/deliveries/", {"status": "pending"})

    assert data["delivery_counts"]["sent"] == 2
    assert data["delivery_counts"]["pending"] == 1
    assert deliveries.data["data"]["count"] == 1


def test_the_campaign_list_query_count_does_not_grow_with_campaigns(admin_client):
    def queries_for(count):
        EmailCampaign.objects.all().delete()
        for index in range(count):
            create_campaign(data={**DRAFT, "name": f"Campaign {index}"})
        with CaptureQueriesContext(connection) as queries:
            admin_client.get(URL)
        return len(queries)

    assert queries_for(1) == queries_for(4)


def test_sending_query_count_does_not_grow_with_the_batch(smtp_active):
    def queries_for(count):
        EmailCampaign.objects.all().delete()
        NewsletterSubscriber.objects.all().delete()
        mail.outbox.clear()
        _subscribers(count, prefix=f"q{count}-")
        _scheduled()
        process_campaigns(batch_size=0)
        with CaptureQueriesContext(connection) as queries:
            process_campaigns()
        assert len(mail.outbox) == count
        return len(queries)

    queries_for(2)  # warms the business profile row the footer reads
    assert queries_for(2) == queries_for(8)
