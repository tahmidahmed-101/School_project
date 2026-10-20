"""GA4 Measurement Protocol and Meta Conversions API clients for Purchase.

Only order facts leave the server: order number, totals, currency, coupon code
and the line snapshot (SKU, name, variant, unit price, quantity). No name,
email, phone, address or IP address is ever sent. The only identifier is a
SHA-256 of the internal customer id, sent to Meta because its API refuses an
event with no user data at all.
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
# GA4 accepts a back-dated timestamp up to 72 hours old; an older retry is
# sent without one and lands at the time it is received.
GA4_MAX_BACKDATE = timedelta(hours=72)


class ConversionDeliveryError(Exception):
    """The provider could not be reached or refused the event. The message is
    safe to store and log: it never carries a credential."""


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


def _money(value: Decimal) -> float:
    return float(value)


def ga4_purchase_payload(facts: PurchaseFacts) -> dict:
    """The order's own totals, unchanged: `value` is the grand total charged.

    The browser's `_ga` client id never reaches the server, so the client id
    is derived from the order. GA4 still counts the purchase and its revenue;
    it just cannot tie it to the session that placed it."""
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
                    "item_id": item["sku"],
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
    payload: dict = {"client_id": f"server.{facts.order_id}", "events": [event]}
    if timezone.now() - facts.occurred_at <= GA4_MAX_BACKDATE:
        payload["timestamp_micros"] = int(facts.occurred_at.timestamp() * 1_000_000)
    return payload


def meta_purchase_payload(facts: PurchaseFacts, *, test_event_code: str = "") -> dict:
    # Pseudonymous and not reversible to contact details; the order id stands
    # in when an order has no customer row.
    external_id = hashlib.sha256((facts.customer_id or facts.order_id).encode()).hexdigest()
    payload: dict = {
        "data": [
            {
                "event_name": "Purchase",
                "event_time": int(facts.occurred_at.timestamp()),
                "event_id": facts.event_id,
                # Confirmed on the server (a captured payment, a cash on
                # delivery order accepted), not observed in a browser. A
                # "website" event would also need the shopper's user agent.
                "action_source": "system_generated",
                "user_data": {"external_id": [external_id]},
                "custom_data": {
                    "currency": facts.currency,
                    "value": _money(facts.value),
                    "order_id": facts.order_number,
                    "content_type": "product",
                    "contents": [
                        {
                            "id": item["sku"],
                            "quantity": item["quantity"],
                            "item_price": _money(item["unit_price"]),
                        }
                        for item in facts.items
                    ],
                    "num_items": sum(item["quantity"] for item in facts.items),
                },
            }
        ],
    }
    if test_event_code:
        payload["test_event_code"] = test_event_code
    return payload


def _post_json(url: str, body: dict, *, provider: str) -> None:
    # Both callers pass a fixed https:// endpoint, never user input.
    request = urllib.request.Request(  # noqa: S310
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=SEND_TIMEOUT_SECONDS) as response:  # noqa: S310
            response.read()
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
