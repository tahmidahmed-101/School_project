"""Server-side Purchase conversions, delivered through an outbox.

`record_purchase` runs inside the transaction that confirms an order and only
writes rows; the HTTP calls happen after the commit, so analytics can neither
block nor roll back a confirmation. `send_conversion_events` (a management
command) retries what failed or was interrupted.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Iterable
from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.marketing.models import ConversionEvent
from apps.marketing.selectors.conversion_settings import (
    ProviderCredentials,
    active_providers,
    load_credentials,
)
from apps.marketing.selectors.conversions import deliverable_conversion_events, purchase_order
from apps.marketing.services.conversion_providers import (
    ConversionDeliveryError,
    PurchaseFacts,
    send_ga4,
    send_meta,
)

logger = logging.getLogger("apps")

# Six tries spread over the retry runs; after that the row stays FAILED for
# someone to look at rather than retrying forever.
MAX_ATTEMPTS = 6

_SENDERS: dict[str, Callable[[PurchaseFacts, ProviderCredentials], None]] = {
    ConversionEvent.Provider.GA4: send_ga4,
    ConversionEvent.Provider.META: send_meta,
}


def record_purchase(order) -> None:
    """Owe each configured provider one Purchase for this order. Call it where
    the order becomes confirmed, inside that transaction.

    Idempotent: the unique (order, provider, event) row means a confirmation
    that runs twice — or an order confirmed, sent back and confirmed again —
    reports one purchase. With no provider configured it writes nothing; the
    only cost is the one query that reads the dashboard settings."""
    providers = active_providers()
    if not providers:
        return
    occurred_at = timezone.now()
    created_ids = []
    for provider in providers:
        event, created = ConversionEvent.objects.get_or_create(
            order_id=order.pk,
            provider=provider,
            event_name=ConversionEvent.EventName.PURCHASE,
            defaults={"event_id": f"purchase-{order.pk}", "occurred_at": occurred_at},
        )
        if created:
            created_ids.append(event.pk)
    if created_ids:
        transaction.on_commit(lambda: deliver_conversion_events(created_ids), robust=True)


def _claim(event_id: UUID) -> bool:
    """Take the row for this sender alone. One conditional UPDATE, so of two
    senders (the commit hook and a retry run) exactly one wins it: the loser's
    UPDATE re-reads the row after the winner commits and no longer matches."""
    return (
        deliverable_conversion_events(max_attempts=MAX_ATTEMPTS)
        .filter(pk=event_id)
        .update(status=ConversionEvent.Status.SENDING, updated_at=timezone.now())
        == 1
    )


def _facts(event: ConversionEvent, order, currency: str) -> PurchaseFacts:
    return PurchaseFacts(
        event_id=event.event_id,
        occurred_at=event.occurred_at,
        order_id=str(order.id),
        order_number=order.order_number,
        customer_id=str(order.customer_id) if order.customer_id else None,
        currency=currency,
        value=order.grand_total,
        tax=order.tax_total,
        shipping=order.shipping_total,
        coupon=order.coupon.code if order.coupon_id else "",
        items=tuple(
            {
                "sku": line.variant_sku,
                "name": line.product_name,
                "variant": line.variant_title,
                "unit_price": line.unit_price,
                "quantity": line.quantity,
            }
            for line in order.lines.all()
        ),
    )


def _currency_code() -> str:
    from apps.business.selectors.business_profile import get_business_profile

    return get_business_profile().currency_code


def deliver_conversion_events(event_ids: Iterable[UUID]) -> int:
    """Send these rows, each at most once at a time. Returns how many reached
    their provider. Never raises: a failure is recorded on the row and left
    for the retry run. Callers run it after the commit (`record_purchase`'s
    hook, the management command), so no row lock is held while a provider
    answers; each row update here is its own autocommit statement.

    Credentials are read once per call, at send time, so a GA4 or Meta
    setting changed in the dashboard applies to the next send and retry."""

    sent = 0
    orders: dict = {}
    currency: str | None = None
    credentials: dict[str, ProviderCredentials | None] | None = None
    for event_id in event_ids:
        if not _claim(event_id):
            continue
        event = ConversionEvent.objects.get(pk=event_id)
        attempts = event.attempts + 1
        try:
            if credentials is None:
                credentials = load_credentials()
            provider_credentials = credentials.get(event.provider)
            if provider_credentials is None:
                raise ConversionDeliveryError(
                    f"{event.provider} is not configured, is switched off, or its saved "
                    "secret cannot be decrypted."
                )
            if event.order_id not in orders:
                orders[event.order_id] = purchase_order(event.order_id)
            order = orders[event.order_id]
            if order is None:
                raise ConversionDeliveryError("Order no longer exists.")
            if currency is None:
                currency = _currency_code()
            _SENDERS[event.provider](_facts(event, order, currency), provider_credentials)
        except Exception as exc:
            message = str(exc) if isinstance(exc, ConversionDeliveryError) else type(exc).__name__
            if not isinstance(exc, ConversionDeliveryError):
                logger.exception("Conversion event %s failed unexpectedly", event.pk)
            else:
                logger.warning(
                    "Conversion %s %s for order %s failed (attempt %d): %s",
                    event.provider,
                    event.event_name,
                    event.order_id,
                    attempts,
                    message,
                )
            ConversionEvent.objects.filter(pk=event.pk).update(
                status=ConversionEvent.Status.FAILED,
                attempts=attempts,
                last_error=message[:500],
                updated_at=timezone.now(),
            )
            continue
        ConversionEvent.objects.filter(pk=event.pk).update(
            status=ConversionEvent.Status.SENT,
            attempts=attempts,
            last_error="",
            sent_at=timezone.now(),
            updated_at=timezone.now(),
        )
        sent += 1
    return sent


def retry_conversion_events(*, limit: int = 200) -> int:
    """What a scheduled run calls: everything pending, failed with attempts
    left, or stuck mid-send."""
    ids = list(
        deliverable_conversion_events(max_attempts=MAX_ATTEMPTS).values_list("pk", flat=True)[
            :limit
        ]
    )
    return deliver_conversion_events(ids)
