from __future__ import annotations

from datetime import datetime, timedelta
from datetime import timezone as dt_timezone
from io import StringIO
from unittest.mock import patch

import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.accounts.factories import StaffUserFactory
from apps.business.selectors.business_profile import get_business_profile
from apps.common.services.sms import SmsDeliveryError
from apps.marketing.models import SmsSubscriber
from apps.marketing.services.cart_recovery import send_cart_recovery
from apps.orders.factories import SalesOrderFactory, SalesOrderLineFactory
from apps.orders.models import SalesOrder

pytestmark = pytest.mark.django_db

DELIVER = "apps.marketing.services.cart_recovery.deliver_sms"
PHONE = "01711223344"


@pytest.fixture(autouse=True)
def _setup(settings):
    settings.STOREFRONT_BASE_URL = "https://shop.example.test"
    settings.TWILIO_ACCOUNT_SID = "sid"
    settings.TWILIO_AUTH_TOKEN = "token"
    settings.TWILIO_PHONE_NUMBER = "+15550000000"
    settings.CART_RECOVERY_IDLE_HOURS = 2
    settings.CART_RECOVERY_MAX_AGE_HOURS = 48
    settings.CART_RECOVERY_DAILY_CAP = 50
    set_switch(True)


def set_switch(on: bool) -> None:
    profile = get_business_profile()
    profile.cart_recovery_enabled = on
    profile.save(update_fields=["cart_recovery_enabled"])


def abandoned_cart(*, idle_hours=3, phone=PHONE, lines=1, **fields) -> SalesOrder:
    cart = SalesOrderFactory(contact_phone=phone, **fields)
    for _ in range(lines):
        SalesOrderLineFactory(order=cart)
    age(cart, idle_hours)
    return cart


def age(cart: SalesOrder, hours: float, now=None) -> None:
    stamp = (now or timezone.now()) - timedelta(hours=hours)
    SalesOrder.objects.filter(pk=cart.pk).update(updated_at=stamp, created_at=stamp)


def run(**kwargs):
    with patch(DELIVER) as deliver:
        result = send_cart_recovery(**kwargs)
    return result, deliver


def test_it_is_off_until_staff_switch_it_on():
    abandoned_cart()
    set_switch(False)

    result, deliver = run()

    assert result == {"sent": 0, "reason": "switched_off"}
    assert deliver.call_count == 0


def test_nothing_is_sent_without_a_storefront_address_or_sms_account(settings):
    abandoned_cart()
    settings.STOREFRONT_BASE_URL = ""
    assert run()[0]["reason"] == "storefront_url_missing"

    settings.STOREFRONT_BASE_URL = "https://shop.example.test"
    settings.TWILIO_AUTH_TOKEN = ""
    assert run()[0]["reason"] == "sms_not_configured"


def test_an_idle_cart_gets_one_text_with_a_link_to_checkout_and_never_a_second():
    cart = abandoned_cart()

    first, deliver = run()
    second, again = run()

    assert first == {"sent": 1, "reason": ""}
    sent = deliver.call_args.kwargs
    assert sent["to"] == "+8801711223344"
    assert sent["body"].endswith("https://shop.example.test/checkout")
    cart.refresh_from_db()
    assert cart.recovery_sent_at is not None
    assert second["sent"] == 0
    assert again.call_count == 0


def test_a_cart_must_be_idle_for_the_minimum_and_not_older_than_the_maximum():
    abandoned_cart(idle_hours=1.5, phone="01711000001")
    abandoned_cart(idle_hours=49, phone="01711000002")
    wanted = abandoned_cart(idle_hours=47, phone="01711000003")

    result, deliver = run()

    assert result["sent"] == 1
    assert deliver.call_args.kwargs["to"] == "+8801711000003"
    wanted.refresh_from_db()
    assert wanted.recovery_sent_at is not None


def test_carts_that_are_not_a_shoppers_to_chase_are_skipped():
    abandoned_cart(lines=0, phone="01711000001")
    abandoned_cart(phone="")
    abandoned_cart(phone="01711000003", deleted_at=timezone.now())
    abandoned_cart(phone="01711000004", created_by=StaffUserFactory())
    abandoned_cart(phone="12345")
    placed = abandoned_cart(phone="01711000006")
    SalesOrder.objects.filter(pk=placed.pk).update(status=SalesOrder.Status.AWAITING_PAYMENT)

    result, deliver = run()

    assert result["sent"] == 0
    assert deliver.call_count == 0


def test_a_shopper_who_ordered_since_is_left_alone_in_any_phone_spelling():
    cart = abandoned_cart(idle_hours=5)
    later = SalesOrderFactory(
        contact_phone="+8801711223344", status=SalesOrder.Status.AWAITING_PAYMENT
    )
    age(later, 3)

    result, _deliver = run()

    assert result["sent"] == 0
    cart.refresh_from_db()
    assert cart.recovery_sent_at is None


def test_an_order_placed_before_the_cart_was_opened_does_not_stop_the_reminder():
    earlier = SalesOrderFactory(contact_phone=PHONE, status=SalesOrder.Status.DELIVERED)
    age(earlier, 30)
    abandoned_cart(idle_hours=3)

    assert run()[0]["sent"] == 1


def test_a_number_that_opted_out_of_texts_is_not_reminded():
    abandoned_cart()
    SmsSubscriber.objects.create(phone="+8801711223344", is_active=False)

    assert run()[0]["sent"] == 0


def test_two_carts_of_one_phone_get_one_text():
    abandoned_cart(idle_hours=4)
    abandoned_cart(idle_hours=3, phone="+8801711223344")

    result, deliver = run()

    assert result["sent"] == 1
    assert deliver.call_count == 1


def test_a_temporary_provider_failure_releases_the_cart_for_the_next_run():
    cart = abandoned_cart()

    with patch(DELIVER, side_effect=SmsDeliveryError("provider_error")):
        assert send_cart_recovery()["sent"] == 0
    cart.refresh_from_db()
    assert cart.recovery_sent_at is None

    assert run()[0]["sent"] == 1


def test_a_refused_number_is_not_tried_again():
    cart = abandoned_cart()

    with patch(DELIVER, side_effect=SmsDeliveryError("recipient_refused")):
        assert send_cart_recovery()["sent"] == 0
    cart.refresh_from_db()

    assert cart.recovery_sent_at is not None
    assert run()[0]["sent"] == 0


def dhaka(day: int, hour: int, minute: int) -> datetime:
    return datetime(2026, 10, day, hour, minute, tzinfo=dt_timezone(timedelta(hours=6)))


def test_the_daily_cap_counts_the_dhaka_day_at_both_ends(settings):
    settings.CART_RECOVERY_DAILY_CAP = 1
    now = dhaka(14, 23, 30)
    SalesOrderFactory(recovery_sent_at=dhaka(14, 0, 30))
    SalesOrderFactory(recovery_sent_at=dhaka(14, 23, 30))
    waiting = abandoned_cart(phone="01711000009")
    age(waiting, 3, now=now)

    capped, deliver = run(now=now)
    assert capped["sent"] == 0
    assert deliver.call_count == 0

    next_day, deliver = run(now=dhaka(15, 0, 30))
    assert next_day["sent"] == 1


def test_the_cap_stops_a_run_part_way(settings):
    settings.CART_RECOVERY_DAILY_CAP = 2
    for index in range(4):
        abandoned_cart(phone=f"0171100000{index}")

    result, deliver = run()

    assert result["sent"] == 2
    assert deliver.call_count == 2
    assert SalesOrder.objects.filter(recovery_sent_at__isnull=False).count() == 2


def test_the_management_command_reports_what_it_did():
    abandoned_cart()
    out = StringIO()

    with patch(DELIVER):
        call_command("send_cart_recovery", stdout=out)

    assert "Sent 1 cart reminder" in out.getvalue()
