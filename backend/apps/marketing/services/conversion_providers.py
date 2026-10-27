"""GA4 Measurement Protocol, Meta Conversions API and TikTok Events API clients
for Purchase.

Order facts leave the server: order number, totals, currency, coupon code and
the line snapshot. Content ids are the catalogue product ids, the same ids the
pixels and the product feed use. No name, email, phone or address is ever sent.
The shopper's browser context (cookies, user agent, IP) is sent only when
checkout stored it, and customer identity only as a SHA-256 of the internal id.
"""

from __future__ import annotations

import hashlib
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal

from django.conf import settings
from django.utils import timezone

from apps.marketing.selectors.conversion_settings import ProviderCredentials

logger = logging.getLogger("apps")

SEND_TIMEOUT_SECONDS = 5
GA4_ENDPOINT = "https://www.google-analytics.com/mp/collect"
META_ENDPOINT = "https://graph.facebook.com/{version}/{pixel_id}/events"
TIKTOK_ENDPOINT = "https://business-api.tiktok.com/open_api/v1.3/event/track/"
# GA4 accepts a back-dated timestamp up to 72 hours old; an older retry is
# sent without one and lands at the time it is received.
GA4_MAX_BACKDATE = timedelta(hours=72)


class ConversionDeliveryError(Exception):
    """The provider could not be reached or refused the event. The message is
    safe to store and log: it never carries a credential."""


class ConversionSkippedError(Exception):
    """The event is not sent because this provider would misattribute it."""


@dataclass(frozen=True)
class BrowserContext:
    fbp: str
    fbc: str
    ga_client_id: str
    ttp: str
    ttclid: str
    source_url: str
    user_agent: str
    ip_address: str


@dataclass(frozen=True)
class PurchaseFacts:
    event_id: str
    occurred_at: datetime
    order_id: str
    order_number: str
    customer_id: str | None
    currency: str
    value: Decimal
    tax: Decimal
    shipping: Decimal
    coupon: str
    items: tuple[dict, ...]
    context: BrowserContext | None = None


def _money(value: Decimal) -> float:
    return float(value)


def ga4_purchase_payload(facts: PurchaseFacts) -> dict:
    """The order's own totals, unchanged: `value` is the grand total charged.

    The browser's `_ga` client id ties the purchase to its visit. Without one
    the purchase is skipped: a made-up client id would count a visitor who
    never came."""
    ga_client_id = facts.context.ga_client_id if facts.context else ""
    if not ga_client_id:
        raise ConversionSkippedError("No _ga client id was stored at checkout.")
    event: dict = {
        "name": "purchase",
        "params": {
            "transaction_id": facts.order_number,
            "currency": facts.currency,
            "value": _money(facts.value),
            "tax": _money(facts.tax),
            "shipping": _money(facts.shipping),
            "items": [
                {
                    "item_id": item["product_id"],
                    "item_name": item["name"],
                    **({"item_variant": item["variant"]} if item["variant"] else {}),
                    "price": _money(item["unit_price"]),
                    "quantity": item["quantity"],
                }
                for item in facts.items
            ],
        },
    }
    if facts.coupon:
        event["params"]["coupon"] = facts.coupon
    payload: dict = {"client_id": ga_client_id, "events": [event]}
    if timezone.now() - facts.occurred_at <= GA4_MAX_BACKDATE:
        payload["timestamp_micros"] = int(facts.occurred_at.timestamp() * 1_000_000)
    return payload


def meta_purchase_payload(facts: PurchaseFacts, *, test_event_code: str = "") -> dict:
    # Meta deduplicates against the pixel's Purchase only for a "website" event,
    # which needs the browser's user agent and the page address. A
    # "system_generated" one is never deduplicated, so the sale would count twice.
    context = facts.context
    if not (context and context.user_agent and context.source_url):
        raise ConversionSkippedError("No user agent or no page address was stored.")
    # Pseudonymous and not reversible to contact details; the order id stands
    # in when an order has no customer row.
    external_id = hashlib.sha256((facts.customer_id or facts.order_id).encode()).hexdigest()
    user_data: dict = {"external_id": [external_id]}
    event: dict = {
        "event_name": "Purchase",
        "event_time": int(facts.occurred_at.timestamp()),
        "event_id": facts.event_id,
        "action_source": "website",
        "event_source_url": context.source_url,
        "user_data": user_data,
        "custom_data": {
            "currency": facts.currency,
            "value": _money(facts.value),
            "order_id": facts.order_number,
            "content_type": "product",
            "contents": [
                {
                    "id": item["product_id"],
                    "quantity": item["quantity"],
                    "item_price": _money(item["unit_price"]),
                }
                for item in facts.items
            ],
            "num_items": sum(item["quantity"] for item in facts.items),
        },
    }
    user_data["client_user_agent"] = context.user_agent
    user_data.update(
        {
            key: value
            for key, value in (
                ("client_ip_address", context.ip_address),
                ("fbp", context.fbp),
                ("fbc", context.fbc),
            )
            if value
        }
    )
    payload: dict = {"data": [event]}
    if test_event_code:
        payload["test_event_code"] = test_event_code
    return payload


def tiktok_purchase_payload(
    facts: PurchaseFacts, *, pixel_code: str, test_event_code: str = ""
) -> dict:
    external_id = hashlib.sha256((facts.customer_id or facts.order_id).encode()).hexdigest()
    user: dict = {"external_id": external_id}
    event: dict = {
        "event": "CompletePayment",
        "event_time": int(facts.occurred_at.timestamp()),
        "event_id": facts.event_id,
        "user": user,
        "properties": {
            "currency": facts.currency,
            "value": _money(facts.value),
            "order_id": facts.order_number,
            "content_type": "product",
            "contents": [
                {
                    "content_id": item["product_id"],
                    "content_name": item["name"],
                    "quantity": item["quantity"],
                    "price": _money(item["unit_price"]),
                }
                for item in facts.items
            ],
        },
    }
    context = facts.context
    if context:
        user.update(
            {
                key: value
                for key, value in (
                    ("ttp", context.ttp),
                    ("ttclid", context.ttclid),
                    ("ip", context.ip_address),
                    ("user_agent", context.user_agent),
                )
                if value
            }
        )
        if context.source_url:
            event["page"] = {"url": context.source_url}
    payload: dict = {"event_source": "web", "event_source_id": pixel_code, "data": [event]}
    if test_event_code:
        payload["test_event_code"] = test_event_code
    return payload


def _post_json(
    url: str, body: dict, *, provider: str, headers: dict[str, str] | None = None
) -> bytes:
    # Every caller passes a fixed https:// endpoint, never user input.
    request = urllib.request.Request(  # noqa: S310
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", **(headers or {})},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=SEND_TIMEOUT_SECONDS) as response:  # noqa: S310
            return response.read()
    except urllib.error.HTTPError as exc:
        # The URL is never part of the message: GA4's carries the API secret.
        reply = exc.read(400).decode("utf-8", "replace")
        raise ConversionDeliveryError(f"{provider} HTTP {exc.code}: {reply}") from None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        reason = getattr(exc, "reason", exc)
        raise ConversionDeliveryError(f"{provider} unreachable: {type(reason).__name__}") from None


def send_ga4(facts: PurchaseFacts, credentials: ProviderCredentials) -> None:
    query = urllib.parse.urlencode(
        {"measurement_id": credentials.tracking_id, "api_secret": credentials.secret}
    )
    _post_json(f"{GA4_ENDPOINT}?{query}", ga4_purchase_payload(facts), provider="GA4")


def send_meta(facts: PurchaseFacts, credentials: ProviderCredentials) -> None:
    url = META_ENDPOINT.format(
        version=settings.META_GRAPH_API_VERSION, pixel_id=credentials.tracking_id
    )
    # The token rides in the body, not the query string, so it never appears
    # in a URL that a proxy or error message might record.
    body = {
        **meta_purchase_payload(facts, test_event_code=credentials.test_event_code),
        "access_token": credentials.secret,
    }
    _post_json(url, body, provider="Meta")


def send_tiktok(facts: PurchaseFacts, credentials: ProviderCredentials) -> None:
    body = tiktok_purchase_payload(
        facts, pixel_code=credentials.tracking_id, test_event_code=credentials.test_event_code
    )
    reply = _post_json(
        TIKTOK_ENDPOINT, body, provider="TikTok", headers={"Access-Token": credentials.secret}
    )
    # TikTok answers HTTP 200 with a non-zero code when it refuses the event.
    try:
        result = json.loads(reply)
    except ValueError:
        raise ConversionDeliveryError("TikTok sent an unreadable reply.") from None
    if result.get("code") != 0:
        message = str(result.get("message"))[:300]
        raise ConversionDeliveryError(f"TikTok refused the event: {message}")
