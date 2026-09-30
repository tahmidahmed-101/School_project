from __future__ import annotations

import pytest

from apps.logistics.models import Carrier, CourierWebhookEvent
from apps.logistics.services.couriers.exceptions import CourierAuthError
from apps.logistics.services.couriers.webhooks import handle_courier_webhook
from apps.logistics.tests.helpers import make_carrier, make_shipment
from apps.orders.models import Shipment

pytestmark = pytest.mark.django_db


def _shipment_for(carrier, tracking_number: str, status=Shipment.Status.SHIPPED):
    shipment = make_shipment(carrier)
    shipment.tracking_number = tracking_number
    shipment.status = status
    shipment.save(update_fields=["tracking_number", "status", "updated_at"])
    return shipment


def test_pathao_webhook_advances_status_and_is_idempotent():
    carrier = make_carrier(Carrier.Provider.PATHAO, webhook_secret="topsecret")
    shipment = _shipment_for(carrier, "DL121224VS8TTJ", status=Shipment.Status.SHIPPED)
    payload = {
        "event": "delivered",
        "consignment_id": "DL121224VS8TTJ",
        "merchant_order_id": shipment.order.order_number,
        "timestamp": "2024-12-24T10:00:00",
    }
    headers = {"X-PATHAO-Signature": "topsecret"}

    status_code, _, _ = handle_courier_webhook(
        carrier, headers=headers, query={}, body=b"", payload=payload
    )
    shipment.refresh_from_db()

    assert status_code == 202
    assert shipment.status == Shipment.Status.DELIVERED
    assert shipment.delivered_at is not None
    assert CourierWebhookEvent.objects.count() == 1

    # Redelivery of the identical payload must not be reprocessed.
    handle_courier_webhook(carrier, headers=headers, query={}, body=b"", payload=payload)
    assert CourierWebhookEvent.objects.count() == 1


def test_pathao_webhook_retries_an_event_that_died_before_finishing():
    """A row already claimed but not yet terminal (RECEIVED, or FAILED —
    which is deliberately excluded from TERMINAL_STATUSES) represents either
    a redelivery of a still-in-flight event or a previous attempt that died
    mid-processing. Either way a redelivery must resume it, not create a
    second row or silently drop it."""
    carrier = make_carrier(Carrier.Provider.PATHAO, webhook_secret="topsecret")
    shipment = _shipment_for(carrier, "DL999", status=Shipment.Status.SHIPPED)
    payload = {
        "event": "delivered",
        "consignment_id": "DL999",
        "merchant_order_id": shipment.order.order_number,
    }
    headers = {"X-PATHAO-Signature": "topsecret"}

    # Simulates another delivery's claim row: same event_id, still RECEIVED
    # because nothing has processed it yet.
    from apps.logistics.services.couriers.webhooks import _event_id

    CourierWebhookEvent.objects.create(
        carrier=carrier,
        event_id=_event_id(carrier, "delivered", payload),
        event_type="delivered",
        payload=payload,
        status=CourierWebhookEvent.Status.RECEIVED,
    )

    status_code, _, _ = handle_courier_webhook(
        carrier, headers=headers, query={}, body=b"", payload=payload
    )
    shipment.refresh_from_db()

    assert status_code == 202
    assert shipment.status == Shipment.Status.DELIVERED
    assert CourierWebhookEvent.objects.count() == 1
    assert CourierWebhookEvent.objects.get().status == CourierWebhookEvent.Status.PROCESSED


def test_pathao_webhook_rejects_bad_signature():
    carrier = make_carrier(Carrier.Provider.PATHAO, webhook_secret="topsecret")
    with pytest.raises(CourierAuthError):
        handle_courier_webhook(
            carrier,
            headers={"X-PATHAO-Signature": "wrong"},
            query={},
            body=b"",
            payload={"event": "delivered", "consignment_id": "X"},
        )


def test_redx_webhook_uses_query_token_not_a_header():
    carrier = make_carrier(Carrier.Provider.REDX, webhook_secret="s3cret-token")
    shipment = _shipment_for(carrier, "TRK-1", status=Shipment.Status.SHIPPED)
    payload = {
        "status": "delivered",
        "tracking_number": "TRK-1",
        "invoice_number": shipment.order.order_number,
    }

    status_code, _, _ = handle_courier_webhook(
        carrier, headers={}, query={"token": "s3cret-token"}, body=b"", payload=payload
    )
    shipment.refresh_from_db()

    assert status_code == 200
    assert shipment.status == Shipment.Status.DELIVERED


def test_redx_webhook_rejects_missing_token():
    carrier = make_carrier(Carrier.Provider.REDX, webhook_secret="s3cret-token")
    with pytest.raises(CourierAuthError):
        handle_courier_webhook(
            carrier, headers={}, query={}, body=b"", payload={"status": "delivered"}
        )


def test_steadfast_webhook_uses_bearer_header():
    carrier = make_carrier(Carrier.Provider.STEADFAST, webhook_secret="bearer-secret")
    shipment = _shipment_for(carrier, "CID-1", status=Shipment.Status.SHIPPED)
    payload = {
        "notification_type": "status_update",
        "status": "delivered",
        "consignment_id": "CID-1",
        "invoice": shipment.order.order_number,
    }

    status_code, _, _ = handle_courier_webhook(
        carrier,
        headers={"Authorization": "Bearer bearer-secret"},
        query={},
        body=b"",
        payload=payload,
    )
    shipment.refresh_from_db()

    assert status_code == 200
    assert shipment.status == Shipment.Status.DELIVERED


def test_steadfast_tracking_update_is_recorded_but_does_not_move_status():
    carrier = make_carrier(Carrier.Provider.STEADFAST, webhook_secret="bearer-secret")
    shipment = _shipment_for(carrier, "CID-2", status=Shipment.Status.SHIPPED)
    payload = {
        "notification_type": "tracking_update",
        "consignment_id": "CID-2",
        "tracking_message": "Parcel reached Dhaka hub",
    }

    handle_courier_webhook(
        carrier,
        headers={"Authorization": "Bearer bearer-secret"},
        query={},
        body=b"",
        payload=payload,
    )
    shipment.refresh_from_db()

    assert shipment.status == Shipment.Status.SHIPPED


def test_webhook_for_unknown_consignment_is_ignored_not_raised():
    carrier = make_carrier(Carrier.Provider.PATHAO, webhook_secret="topsecret")
    payload = {"event": "delivered", "consignment_id": "does-not-exist"}

    status_code, _, _ = handle_courier_webhook(
        carrier,
        headers={"X-PATHAO-Signature": "topsecret"},
        query={},
        body=b"",
        payload=payload,
    )

    assert status_code == 202
    event = CourierWebhookEvent.objects.get()
    assert event.status == CourierWebhookEvent.Status.IGNORED
    assert event.shipment_id is None


def test_out_of_order_status_does_not_regress_the_shipment():
    carrier = make_carrier(Carrier.Provider.PATHAO, webhook_secret="topsecret")
    shipment = _shipment_for(carrier, "DL2", status=Shipment.Status.OUT_FOR_DELIVERY)
    payload = {"event": "picked", "consignment_id": "DL2"}  # maps to IN_TRANSIT, a lower rank

    handle_courier_webhook(
        carrier,
        headers={"X-PATHAO-Signature": "topsecret"},
        query={},
        body=b"",
        payload=payload,
    )
    shipment.refresh_from_db()

    assert shipment.status == Shipment.Status.OUT_FOR_DELIVERY


def test_webhook_does_not_reopen_a_terminal_shipment():
    carrier = make_carrier(Carrier.Provider.PATHAO, webhook_secret="topsecret")
    shipment = _shipment_for(carrier, "DL3", status=Shipment.Status.DELIVERED)
    payload = {"event": "in-transit", "consignment_id": "DL3"}

    handle_courier_webhook(
        carrier,
        headers={"X-PATHAO-Signature": "topsecret"},
        query={},
        body=b"",
        payload=payload,
    )
    shipment.refresh_from_db()

    assert shipment.status == Shipment.Status.DELIVERED
