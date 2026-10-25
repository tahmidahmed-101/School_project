from __future__ import annotations

import io
import json
import urllib.error
from datetime import timedelta
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

import pytest
from django.core.management import call_command
from django.db import connection, transaction
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.accounting.tests.helpers import seed_chart_of_accounts
from apps.accounts.factories import CustomerUserFactory
from apps.catalog.factories import ProductVariantFactory
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.marketing.models import ConversionEvent, OrderTrackingContext
from apps.marketing.services.conversions import (
    MAX_ATTEMPTS,
    deliver_conversion_events,
    record_purchase,
    retry_conversion_events,
)
from apps.orders.constants import PaymentMethodKey
from apps.orders.models import SalesOrder
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.orders import cancel_order, set_order_status
from apps.orders.services.payments import capture_payment, record_payment_due

pytestmark = pytest.mark.django_db

URLOPEN = "apps.marketing.services.conversion_providers.urllib.request.urlopen"
GA4_SECRET = "ga4-secret-value"
META_TOKEN = "meta-token-value"


@pytest.fixture(autouse=True)
def _chart_of_accounts():
    seed_chart_of_accounts()


@pytest.fixture
def providers(settings):
    settings.GA4_MEASUREMENT_ID = "G-TEST123"
    settings.GA4_API_SECRET = GA4_SECRET
    settings.META_PIXEL_ID = "1234567890"
    settings.META_CAPI_ACCESS_TOKEN = META_TOKEN
    settings.META_TEST_EVENT_CODE = ""
    return settings


class _Reply(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def _ok(*_args, **_kwargs):
    return _Reply(b"{}")


def _checked_out(lines=1, quantity=2):
    batch = CustomerUserFactory._meta.model.objects.count()
    customer = CustomerUserFactory(email=f"private{batch}@example.com")
    cart = get_or_create_cart(customer)
    cart.contact_phone = "01711223344"
    cart.save(update_fields=["contact_phone"])
    for index in range(lines):
        variant = ProductVariantFactory(price=Decimal("150.00"), sku=f"SKU-{batch}-{index}")
        record_movement(
            variant=variant, movement_type=MovementType.PURCHASE_IN, quantity=10, unit_cost=1
        )
        add_line(order=cart, variant=variant, quantity=quantity)
    checkout(order=cart)
    cart.refresh_from_db()
    return cart


def _confirm_cod(order, capture):
    with capture(execute=True):
        record_payment_due(order=order, method=PaymentMethodKey.COD)
    order.refresh_from_db()
    return order


def _provider_of(url: str) -> str:
    if "google" in url:
        return "ga4"
    return "tiktok" if "tiktok" in url else "meta"


def _bodies(urlopen):
    return {
        _provider_of(call.args[0].full_url): json.loads(call.args[0].data)
        for call in urlopen.call_args_list
    }


def test_nothing_is_recorded_when_no_provider_is_configured(
    django_capture_on_commit_callbacks,
):
    order = _checked_out()

    with CaptureQueriesContext(connection) as queries, patch(URLOPEN) as urlopen:
        record_purchase(order)
    _confirm_cod(order, django_capture_on_commit_callbacks)

    # Only the read of the (absent) dashboard settings.
    assert len(queries) == 1
    assert not ConversionEvent.objects.exists()
    urlopen.assert_not_called()


def test_an_order_awaiting_payment_sends_no_purchase(providers, django_capture_on_commit_callbacks):
    order = _checked_out()

    with patch(URLOPEN) as urlopen, django_capture_on_commit_callbacks(execute=True):
        record_payment_due(order=order, method=PaymentMethodKey.BKASH)

    order.refresh_from_db()
    assert order.status == SalesOrder.Status.AWAITING_PAYMENT
    assert not ConversionEvent.objects.exists()
    urlopen.assert_not_called()


def test_a_cancelled_order_sends_no_purchase(providers, django_capture_on_commit_callbacks):
    order = _checked_out()

    with patch(URLOPEN) as urlopen, django_capture_on_commit_callbacks(execute=True):
        cancel_order(order=order)

    assert not ConversionEvent.objects.exists()
    urlopen.assert_not_called()


def test_a_confirmed_cash_on_delivery_order_sends_one_purchase_per_provider(
    providers, django_capture_on_commit_callbacks
):
    order = _checked_out(lines=2, quantity=2)

    with patch(URLOPEN, side_effect=_ok) as urlopen:
        _confirm_cod(order, django_capture_on_commit_callbacks)

    assert order.status == SalesOrder.Status.CONFIRMED
    assert set(ConversionEvent.objects.values_list("provider", "status")) == {
        ("ga4", "sent"),
        ("meta", "sent"),
    }
    bodies = _bodies(urlopen)
    ga4 = bodies["ga4"]["events"][0]
    assert ga4["name"] == "purchase"
    assert ga4["params"]["transaction_id"] == order.order_number
    assert ga4["params"]["value"] == float(order.grand_total)
    assert ga4["params"]["currency"] == "BDT"
    assert sorted(
        (item["item_id"], item["quantity"], item["price"]) for item in ga4["params"]["items"]
    ) == sorted((str(line.variant.product_id), 2, 150.0) for line in order.lines.all())
    meta = bodies["meta"]["data"][0]
    assert meta["event_name"] == "Purchase"
    assert meta["event_id"] == f"purchase-{order.id}"
    assert meta["action_source"] == "system_generated"
    assert meta["custom_data"]["value"] == float(order.grand_total)
    assert meta["custom_data"]["order_id"] == order.order_number
    assert meta["custom_data"]["num_items"] == 4
    assert bodies["meta"]["access_token"] == META_TOKEN


def test_no_contact_details_reach_either_provider(providers, django_capture_on_commit_callbacks):
    order = _checked_out()

    with patch(URLOPEN, side_effect=_ok) as urlopen:
        _confirm_cod(order, django_capture_on_commit_callbacks)

    sent = json.dumps(_bodies(urlopen))
    assert order.customer.email not in sent
    assert "01711223344" not in sent
    assert str(order.customer_id) not in sent


def test_a_captured_payment_sends_the_purchase(providers, django_capture_on_commit_callbacks):
    order = _checked_out()

    with patch(URLOPEN, side_effect=_ok), django_capture_on_commit_callbacks(execute=True):
        capture_payment(order=order, amount=order.grand_total)

    assert ConversionEvent.objects.filter(order=order, status="sent").count() == 2


def test_confirming_again_never_reports_the_purchase_twice(
    providers, django_capture_on_commit_callbacks
):
    order = _checked_out()
    with patch(URLOPEN, side_effect=_ok) as urlopen:
        _confirm_cod(order, django_capture_on_commit_callbacks)
        with django_capture_on_commit_callbacks(execute=True):
            record_purchase(order)
        deliver_conversion_events(ConversionEvent.objects.values_list("pk", flat=True))
        retry_conversion_events()

    assert ConversionEvent.objects.count() == 2
    assert urlopen.call_count == 2


def test_a_manual_confirmation_records_the_purchase(providers, django_capture_on_commit_callbacks):
    order = _checked_out()

    with patch(URLOPEN, side_effect=_ok), django_capture_on_commit_callbacks(execute=True):
        set_order_status(order=order, new_status=SalesOrder.Status.CONFIRMED)

    assert ConversionEvent.objects.filter(order=order, status="sent").count() == 2


def test_a_provider_failure_leaves_the_order_confirmed_and_is_retried(
    providers, django_capture_on_commit_callbacks
):
    order = _checked_out()
    failure = urllib.error.HTTPError(
        "https://www.google-analytics.com/mp/collect?api_secret=" + GA4_SECRET,
        500,
        "boom",
        {},
        io.BytesIO(b"server error"),
    )

    with patch(URLOPEN, side_effect=failure):
        _confirm_cod(order, django_capture_on_commit_callbacks)

    assert order.status == SalesOrder.Status.CONFIRMED
    failed = ConversionEvent.objects.get(provider="ga4")
    assert (failed.status, failed.attempts) == ("failed", 1)
    assert "HTTP 500" in failed.last_error
    assert GA4_SECRET not in failed.last_error

    out = StringIO()
    with patch(URLOPEN, side_effect=_ok):
        call_command("send_conversion_events", stdout=out)

    assert "Sent 2" in out.getvalue()
    failed.refresh_from_db()
    assert (failed.status, failed.attempts, failed.last_error) == ("sent", 2, "")


def test_an_unreachable_provider_is_recorded_without_raising(
    providers, django_capture_on_commit_callbacks
):
    order = _checked_out()

    with patch(URLOPEN, side_effect=urllib.error.URLError(TimeoutError())):
        _confirm_cod(order, django_capture_on_commit_callbacks)

    assert set(ConversionEvent.objects.values_list("status", flat=True)) == {"failed"}


def test_retries_stop_after_the_last_attempt(providers):
    order = _checked_out()
    with transaction.atomic():
        record_purchase(order)
    ConversionEvent.objects.update(status="failed", attempts=MAX_ATTEMPTS)

    with patch(URLOPEN) as urlopen:
        assert retry_conversion_events() == 0

    urlopen.assert_not_called()


def test_a_send_in_flight_is_left_alone_until_it_goes_stale(providers):
    order = _checked_out()
    with transaction.atomic():
        record_purchase(order)
    ConversionEvent.objects.update(status="sending")

    with patch(URLOPEN, side_effect=_ok) as urlopen:
        assert retry_conversion_events() == 0
        ConversionEvent.objects.update(updated_at=timezone.now() - timedelta(hours=1))
        assert retry_conversion_events() == 2

    assert urlopen.call_count == 2


def test_a_removed_provider_configuration_fails_the_row_instead_of_sending(providers, settings):
    order = _checked_out()
    with transaction.atomic():
        record_purchase(order)
    settings.META_CAPI_ACCESS_TOKEN = ""

    with patch(URLOPEN, side_effect=_ok) as urlopen:
        retry_conversion_events()

    meta = ConversionEvent.objects.get(provider="meta")
    assert meta.status == "failed"
    assert meta.last_error.startswith("meta is not configured")
    assert urlopen.call_count == 1


def _delivery_queries(lines):
    order = _checked_out(lines=lines, quantity=1)
    with transaction.atomic():
        record_purchase(order)
    ids = list(ConversionEvent.objects.filter(order=order).values_list("pk", flat=True))
    with patch(URLOPEN, side_effect=_ok), CaptureQueriesContext(connection) as queries:
        deliver_conversion_events(ids)
    return len(queries)


def test_delivery_query_count_does_not_grow_with_order_lines(providers):
    # Warm the business profile row so both runs read it the same way.
    _delivery_queries(1)

    assert _delivery_queries(1) == _delivery_queries(5)


@pytest.fixture
def all_providers(providers):
    providers.TIKTOK_PIXEL_ID = "C4TESTPIXEL123"
    providers.TIKTOK_EVENTS_ACCESS_TOKEN = "tiktok-token-value-0123456789"
    providers.TIKTOK_TEST_EVENT_CODE = ""
    return providers


def _with_browser_context(order, **overrides):
    values = {
        "fbp": "fb.1.1700000000.123",
        "fbc": "fb.1.1700000000.AbCd",
        "ga_client_id": "123456.1700000000",
        "ttp": "ttp-cookie",
        "ttclid": "ttclid-value",
        "source_url": "https://shop.example/checkout",
        "user_agent": "Mozilla/5.0 Test",
        "ip_address": "203.0.113.7",
    }
    return OrderTrackingContext.objects.create(order=order, **{**values, **overrides})


def test_browser_context_makes_meta_a_website_event_and_ties_ga4_to_the_visit(
    providers, django_capture_on_commit_callbacks
):
    order = _checked_out()
    _with_browser_context(order)

    with patch(URLOPEN, side_effect=_ok) as urlopen:
        _confirm_cod(order, django_capture_on_commit_callbacks)

    bodies = _bodies(urlopen)
    meta = bodies["meta"]["data"][0]
    assert meta["action_source"] == "website"
    assert meta["event_source_url"] == "https://shop.example/checkout"
    assert meta["user_data"]["client_user_agent"] == "Mozilla/5.0 Test"
    assert meta["user_data"]["client_ip_address"] == "203.0.113.7"
    assert meta["user_data"]["fbp"] == "fb.1.1700000000.123"
    assert meta["user_data"]["fbc"] == "fb.1.1700000000.AbCd"
    assert bodies["ga4"]["client_id"] == "123456.1700000000"
    sent = json.dumps(bodies)
    assert order.customer.email not in sent
    assert "01711223344" not in sent


def test_meta_stays_system_generated_without_a_page_address(
    providers, django_capture_on_commit_callbacks
):
    order = _checked_out()
    _with_browser_context(order, source_url="")

    with patch(URLOPEN, side_effect=_ok) as urlopen:
        _confirm_cod(order, django_capture_on_commit_callbacks)

    assert _bodies(urlopen)["meta"]["data"][0]["action_source"] == "system_generated"


def test_tiktok_purchase_carries_the_product_ids_and_the_browser_context(
    all_providers, django_capture_on_commit_callbacks
):
    order = _checked_out(lines=2, quantity=2)
    _with_browser_context(order)

    with patch(URLOPEN, side_effect=lambda *a, **k: _Reply(b'{"code": 0}')) as urlopen:
        _confirm_cod(order, django_capture_on_commit_callbacks)

    assert ConversionEvent.objects.get(provider="tiktok").status == "sent"
    request = next(
        call.args[0] for call in urlopen.call_args_list if "tiktok" in call.args[0].full_url
    )
    assert request.get_header("Access-token") == "tiktok-token-value-0123456789"
    body = json.loads(request.data)
    assert body["event_source"] == "web"
    assert body["event_source_id"] == "C4TESTPIXEL123"
    event = body["data"][0]
    assert event["event"] == "CompletePayment"
    assert event["event_id"] == f"purchase-{order.id}"
    assert event["properties"]["value"] == float(order.grand_total)
    assert sorted(c["content_id"] for c in event["properties"]["contents"]) == sorted(
        str(line.variant.product_id) for line in order.lines.all()
    )
    assert event["user"]["ttp"] == "ttp-cookie"
    assert event["user"]["ttclid"] == "ttclid-value"
    assert event["user"]["ip"] == "203.0.113.7"
    assert event["page"]["url"] == "https://shop.example/checkout"


def test_a_tiktok_refusal_is_recorded_and_the_order_stays_confirmed(
    all_providers, django_capture_on_commit_callbacks
):
    order = _checked_out()

    reply = b'{"code": 40001, "message": "Invalid access token"}'
    with patch(URLOPEN, side_effect=lambda *a, **k: _Reply(reply)):
        _confirm_cod(order, django_capture_on_commit_callbacks)

    assert order.status == SalesOrder.Status.CONFIRMED
    event = ConversionEvent.objects.get(provider="tiktok")
    assert event.status == "failed"
    assert "Invalid access token" in event.last_error
    assert "tiktok-token-value" not in event.last_error


def test_a_staff_entered_order_sends_no_purchase(
    providers, staff_user, django_capture_on_commit_callbacks
):
    order = _checked_out()
    SalesOrder.objects.filter(pk=order.pk).update(created_by=staff_user)

    with patch(URLOPEN, side_effect=_ok) as urlopen:
        _confirm_cod(order, django_capture_on_commit_callbacks)

    assert not ConversionEvent.objects.exists()
    urlopen.assert_not_called()
