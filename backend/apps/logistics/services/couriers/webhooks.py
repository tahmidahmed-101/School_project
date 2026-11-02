"""Courier webhook ingestion.

The delivery is recorded before it is interpreted, so a redelivery after a
half-way failure is recognised rather than silently reprocessed or dropped.
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.logistics.models import Carrier, CourierWebhookEvent
from apps.logistics.services.couriers.exceptions import CourierAuthError
from apps.logistics.services.couriers.registry import get_gateway_for_carrier
from apps.orders.selectors.shipments import get_shipment_by_carrier_and_tracking_number
from apps.orders.services.shipments import can_advance_shipment_status, update_shipment_status

logger = logging.getLogger(__name__)

Status = CourierWebhookEvent.Status


def _event_type(payload: dict[str, Any]) -> str:
    return str(
        payload.get("event") or payload.get("notification_type") or payload.get("status") or ""
    )


def _event_id(carrier: Carrier, event_type: str, payload: dict[str, Any]) -> str:
    """Couriers do not issue their own event ids, so derive a stable one from
    the full payload: an identical redelivery hashes identically and is
    recognised as a duplicate; a genuinely different event, even one that
    otherwise collides on carrier/type, does not."""
    digest = hashlib.sha256(
        json.dumps(
            {"carrier": str(carrier.id), "type": event_type, "payload": payload},
            sort_keys=True,
            default=str,
        ).encode()
    ).hexdigest()
    return f"{carrier.id}:{digest}"


def handle_courier_webhook(
    carrier: Carrier,
    *,
    headers: dict[str, str],
    query: dict[str, str],
    body: bytes,
    payload: dict[str, Any],
) -> tuple[int, dict[str, str], dict[str, Any]]:
    """Verify, record and process one delivery. Returns the courier's ack shape."""
    gateway = get_gateway_for_carrier(carrier)

    if not gateway.verify_webhook(headers, query, body):
        raise CourierAuthError(
            f"{carrier.name} webhook signature verification failed.",
            code="webhook_signature_invalid",
        )

    ack_status, ack_headers, ack_body = gateway.webhook_ack()
    event_type = _event_type(payload)
    event_id = _event_id(carrier, event_type, payload)

    # Recorded in its own short transaction, committed immediately, before
    # any interpretation — so a crash mid-processing still leaves a row a
    # later redelivery can find and retry (IntegrityError just means an
    # earlier delivery already recorded it).
    try:
        with transaction.atomic():
            CourierWebhookEvent.objects.create(
                carrier=carrier, event_id=event_id, event_type=event_type, payload=payload
            )
    except IntegrityError:
        pass

    with transaction.atomic():
        # Locks the row for the whole claim-and-process attempt. Two
        # simultaneous deliveries of the same event both reach this point;
        # the second blocks here until the first commits, then sees the
        # now-terminal status below and returns without reprocessing —
        # exactly one processing attempt regardless of how many redeliveries
        # arrive concurrently.
        record = CourierWebhookEvent.objects.select_for_update().get(event_id=event_id)
        if record.status in CourierWebhookEvent.TERMINAL_STATUSES:
            return ack_status, ack_headers, ack_body
        if record.status != Status.RECEIVED:
            # A previous attempt failed before finishing; retry rather than
            # swallow it.
            record.status = Status.RECEIVED
            record.error_message = ""
            record.save(update_fields=["status", "error_message", "updated_at"])

        try:
            processed = _process(carrier, gateway, record, payload)
        except Exception as exc:
            logger.exception("Courier webhook processing failed", extra={"event_id": event_id})
            _finish(record, Status.FAILED, error=str(exc))
            raise

        _finish(record, Status.PROCESSED if processed else Status.IGNORED)

    return ack_status, ack_headers, ack_body


def _process(
    carrier: Carrier, gateway, record: CourierWebhookEvent, payload: dict[str, Any]
) -> bool:
    events = gateway.parse_webhook(payload)
    if not events:
        return False

    applied = False
    for event in events:
        consignment_id = event.get("consignment_id", "")
        shipment = get_shipment_by_carrier_and_tracking_number(carrier, consignment_id)
        if shipment is None:
            logger.warning(
                "Courier webhook did not match a shipment",
                extra={"carrier": str(carrier.id), "consignment_id": event.get("consignment_id")},
            )
            continue

        if record.shipment_id is None:
            record.shipment = shipment
            record.save(update_fields=["shipment", "updated_at"])

        status = event.get("status") or ""
        provider_status = event.get("provider_status") or ""
        if not status:
            # Unmapped or free-text progress note: keep the raw text visible,
            # but never guess a domain status from it.
            if provider_status and provider_status != shipment.courier_status:
                shipment.courier_status = provider_status
                shipment.save(update_fields=["courier_status", "updated_at"])
                applied = True
            continue

        if shipment.status in shipment.TERMINAL_STATUSES:
            continue
        if not can_advance_shipment_status(shipment.status, status):
            continue

        update_shipment_status(shipment=shipment, status=status, courier_status=provider_status)
        applied = True

    return applied


def _finish(record: CourierWebhookEvent, status: str, *, error: str = "") -> None:
    record.status = status
    record.processed_at = timezone.now()
    record.error_message = error
    record.save(update_fields=["status", "processed_at", "error_message", "updated_at"])
