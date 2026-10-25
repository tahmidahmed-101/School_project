from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from django.core.cache import cache
from twilio.base.exceptions import TwilioRestException

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.common.services import sms
from apps.common.services.sms import SmsDeliveryError, deliver_sms, send_sms
from apps.common.utils.phone import e164_bd_mobile
from apps.marketing.models import CampaignDelivery, EmailCampaign, SmsSubscriber
from apps.marketing.selectors.campaigns import MAX_DELIVERY_ATTEMPTS
from apps.marketing.services.campaigns import (
    SMS_MAX_BODY,
    cancel_campaign,
    create_campaign,
    process_campaigns,
    schedule_campaign,
)
from apps.marketing.services.sms_subscribers import (
    is_sms_opted_in,
    make_sms_unsubscribe_token,
    sms_opt_in,
    sms_opt_out,
)
from apps.orders.tests.test_public_checkout_api import (
    GUEST_CHECKOUT_URL,
    _configured_delivery,
    _guest_payload,
    _stocked_variant,
)

pytestmark = pytest.mark.django_db

URL = "/api/v1/admin/marketing/campaigns/"
API_BASE = "https://api.example.test"
DELIVER = "apps.marketing.services.campaigns.deliver_sms"
DRAFT = {"name": "Eid offer", "channel": "sms", "body": "Eid sale: 20% off this week."}
NUMBERS = ["01711000001", "+8801711000002", "8801711000003"]


@pytest.fixture(autouse=True)
def _setup(settings):
    settings.PUBLIC_API_BASE_URL = API_BASE
    settings.TWILIO_ACCOUNT_SID = "sid"
    settings.TWILIO_AUTH_TOKEN = "token"
    settings.TWILIO_PHONE_NUMBER = "+15550000000"
    cache.clear()


@pytest.fixture
def admin_client(api_client):
    api_client.force_authenticate(user=create_user(email="owner@example.com", role=UserRole.ADMIN))
    return api_client


def _opted_in(numbers=NUMBERS):
    return [sms_opt_in(phone=number) for number in numbers]


def _scheduled(**overrides):
    return schedule_campaign(campaign=create_campaign(data={**DRAFT, **overrides}))


# --- sms.py reasons ----------------------------------------------------------


def test_a_missing_twilio_account_is_told_apart_from_a_provider_error(settings):
    settings.TWILIO_ACCOUNT_SID = ""

    with pytest.raises(SmsDeliveryError) as missing:
        deliver_sms(to="+8801711000001", body="hi")
    assert missing.value.reason == sms.NOT_CONFIGURED
    assert send_sms(to="+8801711000001", body="hi") is False


def test_provider_refusals_are_permanent_only_when_the_number_is_bad(settings):
    def failing(code):
        client = MagicMock()
        client.messages.create.side_effect = TwilioRestException(400, "uri", code=code)
        return client

    def reason_with(**patch_args) -> str:
        with patch.object(sms, "TwilioClient", **patch_args), pytest.raises(SmsDeliveryError) as e:
            deliver_sms(to="+8801711000001", body="hi")
        return e.value.reason

    assert reason_with(return_value=failing(21211)) == sms.RECIPIENT_REFUSED
    assert reason_with(return_value=failing(30003)) == sms.PROVIDER_ERROR
    assert reason_with(side_effect=OSError("down")) == sms.NETWORK_ERROR


def test_send_sms_still_returns_true_when_the_provider_accepts(settings):
    client = MagicMock()
    client.messages.create.return_value.sid = "SM1"

    with patch.object(sms, "TwilioClient", return_value=client):
        assert send_sms(to="+8801711000001", body="code 123456") is True


def test_every_spelling_of_a_mobile_is_one_e164_number():
    assert {e164_bd_mobile(raw) for raw in ("01711223344", "8801711223344", "+8801711223344")} == {
        "+8801711223344"
    }
    assert e164_bd_mobile("0171122") == ""
    assert e164_bd_mobile("") == ""


# --- Consent -----------------------------------------------------------------


def test_opting_in_stores_one_row_per_number_with_a_consent_time():
    first = sms_opt_in(phone="01711223344")
    again = sms_opt_in(phone="+8801711223344")

    assert first.pk == again.pk
    assert first.phone == "+8801711223344"
    assert first.consented_at is not None
    assert sms_opt_in(phone="12345") is None


def test_opting_out_then_in_again_is_fresh_consent():
    sms_opt_in(phone="01711223344")
    sms_opt_out(phone="01711223344")
    assert is_sms_opted_in("01711223344") is False

    sms_opt_in(phone="01711223344")
    assert is_sms_opted_in("+8801711223344") is True


def test_checkout_records_consent_only_when_the_box_is_ticked(api_client):
    _configured_delivery()
    variant = _stocked_variant()

    plain = api_client.post(GUEST_CHECKOUT_URL, _guest_payload(variant), format="json")
    assert plain.status_code == 201, plain.data
    assert not SmsSubscriber.objects.exists()

    ticked = api_client.post(
        GUEST_CHECKOUT_URL, _guest_payload(variant, sms_marketing_opt_in=True), format="json"
    )
    assert ticked.status_code == 201, ticked.data
    assert SmsSubscriber.objects.get().phone == "+8801700000000"

    later = api_client.post(GUEST_CHECKOUT_URL, _guest_payload(variant), format="json")
    assert later.status_code == 201, later.data
    assert is_sms_opted_in("01700000000") is True


def test_the_account_toggle_reads_and_changes_consent(api_client):
    user = create_user(email="shopper@example.com")
    user.phone = "01711223344"
    user.save(update_fields=["phone"])
    api_client.force_authenticate(user=user)
    url = "/api/v1/customer/profile/sms-marketing/"

    assert api_client.get(url).data["data"] == {"phone": "+8801711223344", "opted_in": False}
    on = api_client.patch(url, {"opted_in": True}, format="json")
    off = api_client.patch(url, {"opted_in": False}, format="json")

    assert on.status_code == 200, on.data
    assert on.data["data"]["opted_in"] is True
    assert off.data["data"]["opted_in"] is False


def test_the_account_toggle_needs_a_bangladeshi_mobile(api_client):
    user = create_user(email="nophone@example.com")
    api_client.force_authenticate(user=user)

    response = api_client.patch(
        "/api/v1/customer/profile/sms-marketing/", {"opted_in": True}, format="json"
    )

    assert response.status_code == 400
    assert not SmsSubscriber.objects.exists()


# --- Campaign lifecycle ------------------------------------------------------


def test_an_sms_draft_needs_no_subject_and_a_bounded_body():
    campaign = create_campaign(data=DRAFT)

    assert campaign.channel == EmailCampaign.Channel.SMS
    assert campaign.subject == ""
    with pytest.raises(Exception, match="at most"):
        create_campaign(data={**DRAFT, "body": "x" * (SMS_MAX_BODY + 1)})


def test_scheduling_needs_twilio_an_opt_out_link_and_an_audience(settings):
    campaign = create_campaign(data=DRAFT)

    with pytest.raises(Exception, match="No subscriber"):
        schedule_campaign(campaign=campaign)
    _opted_in()
    settings.TWILIO_ACCOUNT_SID = ""
    with pytest.raises(Exception, match="SMS is not set up"):
        schedule_campaign(campaign=campaign)
    settings.TWILIO_ACCOUNT_SID = "sid"
    settings.PUBLIC_API_BASE_URL = ""
    with pytest.raises(Exception, match="opt-out link"):
        schedule_campaign(campaign=campaign)


def test_only_opted_in_phones_get_a_text_each_with_its_own_opt_out_link():
    _opted_in()
    SmsSubscriber.objects.create(phone="+8801711000009", is_active=False)
    SmsSubscriber.objects.create(phone="+8801711000008", consented_at=None)
    campaign = _scheduled()

    with patch(DELIVER) as deliver:
        result = process_campaigns()

    sent_to = sorted(call.kwargs["to"] for call in deliver.call_args_list)
    assert sent_to == sorted(e164_bd_mobile(n) for n in NUMBERS)
    assert result == {"started": 1, "sent": 0, "sms_sent": 3}
    assert all(
        f"{API_BASE}/api/v1/public/marketing/sms-unsubscribe/" in call.kwargs["body"]
        and call.kwargs["body"].startswith(DRAFT["body"])
        for call in deliver.call_args_list
    )
    campaign.refresh_from_db()
    assert campaign.status == EmailCampaign.Status.SENT
    assert campaign.recipient_count == 3


def test_an_opt_out_after_the_campaign_started_is_honoured_on_the_next_run():
    _opted_in()
    _scheduled()
    with patch(DELIVER):
        process_campaigns(batch_size=1)
    for waiting in CampaignDelivery.objects.filter(status=CampaignDelivery.Status.PENDING):
        sms_opt_out(phone=waiting.phone)

    with patch(DELIVER) as deliver:
        process_campaigns()

    assert deliver.call_count == 0
    skipped = CampaignDelivery.objects.filter(status=CampaignDelivery.Status.SKIPPED)
    assert skipped.count() == 2
    assert {d.failure_reason for d in skipped} == {"unsubscribed"}


def test_a_provider_error_is_retried_then_given_up_with_its_reason():
    _opted_in(NUMBERS[:1])
    campaign = _scheduled()

    with patch(DELIVER, side_effect=SmsDeliveryError(sms.PROVIDER_ERROR)) as deliver:
        for _ in range(MAX_DELIVERY_ATTEMPTS + 1):
            process_campaigns()

    row = CampaignDelivery.objects.get(campaign=campaign)
    assert deliver.call_count == MAX_DELIVERY_ATTEMPTS
    assert (row.status, row.attempts, row.failure_reason) == (
        CampaignDelivery.Status.FAILED,
        MAX_DELIVERY_ATTEMPTS,
        sms.PROVIDER_ERROR,
    )


def test_a_refused_number_is_tried_once_and_a_retry_recovers_a_transient_failure():
    _opted_in(NUMBERS[:2])
    campaign = _scheduled()
    errors = {
        e164_bd_mobile(NUMBERS[0]): SmsDeliveryError(sms.RECIPIENT_REFUSED),
        e164_bd_mobile(NUMBERS[1]): SmsDeliveryError(sms.NETWORK_ERROR),
    }
    calls = []

    def flaky(*, to, body):
        calls.append(to)
        if errors.get(to) and calls.count(to) == 1:
            raise errors[to]

    with patch(DELIVER, side_effect=flaky):
        for _ in range(3):
            process_campaigns()

    rows = {r.phone: r for r in CampaignDelivery.objects.filter(campaign=campaign)}
    refused = rows[e164_bd_mobile(NUMBERS[0])]
    recovered = rows[e164_bd_mobile(NUMBERS[1])]
    assert (refused.status, refused.attempts) == (
        CampaignDelivery.Status.FAILED,
        MAX_DELIVERY_ATTEMPTS,
    )
    assert refused.failure_reason == sms.RECIPIENT_REFUSED
    assert (recovered.status, recovered.attempts) == (CampaignDelivery.Status.SENT, 2)
    assert calls.count(refused.phone) == 1


def test_the_sms_batch_size_is_its_own_limit(settings):
    settings.SMS_CAMPAIGN_BATCH_SIZE = 2
    _opted_in()
    campaign = _scheduled()

    with patch(DELIVER) as deliver:
        process_campaigns()

    assert deliver.call_count == 2
    campaign.refresh_from_db()
    assert campaign.status == EmailCampaign.Status.SENDING


def test_cancelling_skips_the_texts_not_yet_sent():
    _opted_in()
    campaign = _scheduled()
    with patch(DELIVER):
        process_campaigns(batch_size=1)

    cancel_campaign(campaign=campaign)

    counts = {
        status: CampaignDelivery.objects.filter(campaign=campaign, status=status).count()
        for status in CampaignDelivery.Status.values
    }
    assert counts["sent"] == 1
    assert counts["skipped"] == 2


def test_an_sms_campaign_sends_no_email():
    from django.core import mail

    _opted_in()
    _scheduled()
    with patch(DELIVER):
        process_campaigns()

    assert mail.outbox == []


# --- Admin API ---------------------------------------------------------------


def test_the_campaign_list_filters_by_channel_and_shows_phone_deliveries(admin_client):
    _opted_in(NUMBERS[:1])
    sms_campaign = _scheduled()
    create_campaign(data={"name": "Mail", "subject": "Hi", "body": "Body"})
    with patch(DELIVER):
        process_campaigns()

    listing = admin_client.get(URL, {"channel": "sms"})
    deliveries = admin_client.get(f"{URL}{sms_campaign.id}/deliveries/")
    audience = admin_client.get(f"{URL}audience/")

    assert [c["id"] for c in listing.data["data"]["results"]] == [str(sms_campaign.id)]
    assert deliveries.data["data"]["results"][0]["phone"] == "+8801711000001"
    assert audience.data["data"]["sms_eligible_recipients"] == 1
    assert audience.data["data"]["sms_footer_length"] > 60


def test_a_test_text_goes_to_the_given_phone_and_creates_no_delivery(admin_client):
    campaign = create_campaign(data=DRAFT)

    with patch(DELIVER) as deliver:
        response = admin_client.post(
            f"{URL}{campaign.id}/test/", {"recipient": "01711999999"}, format="json"
        )

    assert response.status_code == 200, response.data
    assert response.data["data"]["recipient"] == "+8801711999999"
    assert deliver.call_args.kwargs["body"].startswith("[Test] ")
    assert not CampaignDelivery.objects.exists()


# --- Opt-out page ------------------------------------------------------------


def test_the_opt_out_page_confirms_on_get_and_opts_out_on_post(client):
    subscriber = sms_opt_in(phone="01711223344")
    url = f"/api/v1/public/marketing/sms-unsubscribe/{make_sms_unsubscribe_token(subscriber.pk)}/"

    shown = client.get(url)
    assert shown.status_code == 200
    assert b"marketing texts" in shown.content
    assert is_sms_opted_in("01711223344") is True

    done = client.post(url)
    assert done.status_code == 200
    assert is_sms_opted_in("01711223344") is False


def test_a_forged_opt_out_token_is_a_404(client):
    response = client.post("/api/v1/public/marketing/sms-unsubscribe/forged/")

    assert response.status_code == 404
