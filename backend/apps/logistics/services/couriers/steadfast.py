from __future__ import annotations

from typing import Any

from django.utils import timezone
from django.utils.crypto import constant_time_compare

from apps.orders.models import Shipment

from .exceptions import CourierAuthError, CourierRateLimitedError, CourierRejectedError
from .http import HttpCourierGateway, parse_courier_datetime
from .recipient import build_recipient, cod_amount, item_description, total_quantity

# docs/couriers.md — Steadfast API Documentation V1. Closed vocabulary; anything
# else means the API changed and is deliberately left unmapped.
STATUS_MAP: dict[str, str] = {
    "in_review": Shipment.Status.SHIPPED,
    "pending": Shipment.Status.IN_TRANSIT,
    "hold": Shipment.Status.IN_TRANSIT,
    "unknown": Shipment.Status.IN_TRANSIT,
    "unknown_approval_pending": Shipment.Status.IN_TRANSIT,
    "cancelled_approval_pending": Shipment.Status.IN_TRANSIT,
    "delivered_approval_pending": Shipment.Status.OUT_FOR_DELIVERY,
    "partial_delivered_approval_pending": Shipment.Status.OUT_FOR_DELIVERY,
    "delivered": Shipment.Status.DELIVERED,
    "partial_delivered": Shipment.Status.DELIVERED,
    "cancelled": Shipment.Status.CANCELLED,
}

HOME_DELIVERY = 0
POINT_DELIVERY = 1


class SteadfastGateway(HttpCourierGateway):
    """Steadfast Courier Limited. Static Api-Key/Secret-Key header pair, no
    token exchange. See docs/couriers.md for the doc revision implemented."""

    default_base_url = "https://portal.packzy.com/api/v1"
    requires_api_secret = True

    def _auth_headers(self) -> dict[str, str]:
        return {"Api-Key": self.carrier.api_key, "Secret-Key": self.carrier.api_secret}

    def create_consignment(self, shipment) -> dict[str, Any]:
        self._require_configured()
        body = self._check(self._request("POST", "/create_order", self._payload(shipment)))
        consignment = body.get("consignment") or {}
        consignment_id = consignment.get("consignment_id")
        if not consignment_id:
            raise CourierRejectedError(
                f"{self.carrier.name} accepted the order but returned no consignment id."
            )
        provider_status = str(consignment.get("status") or "")
        return {
            "consignment_id": str(consignment_id),
            "tracking_code": str(consignment.get("tracking_code") or ""),
            "status": STATUS_MAP.get(provider_status, ""),
            "provider_status": provider_status,
        }

    def get_tracking_status(self, consignment_id: str) -> dict[str, Any]:
        self._require_configured()
        body = self._check(self._request("GET", f"/status_by_cid/{consignment_id}"))
        provider_status = str(body.get("delivery_status") or "")
        return {
            "consignment_id": str(consignment_id),
            "status": STATUS_MAP.get(provider_status, ""),
            "provider_status": provider_status,
        }

    def cancel_consignment(self, consignment_id: str) -> bool:
        self._require_configured()
        self._check(
            self._request("POST", "/create_return_request", {"consignment_id": consignment_id})
        )
        return True

    def verify_webhook(self, headers: dict[str, str], query: dict[str, str], body: bytes) -> bool:
        expected = self.carrier.webhook_secret
        supplied = headers.get("Authorization", "").removeprefix("Bearer ").strip()
        return bool(expected) and constant_time_compare(expected, supplied)

    def parse_webhook(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        notification = str(payload.get("notification_type", ""))
        occurred = parse_courier_datetime(payload.get("updated_at")) or timezone.now()
        consignment_id = str(payload.get("consignment_id", ""))

        if notification == "tracking_update":
            # Free-text progress note with no status of its own; recorded, but
            # it must not move the shipment.
            return [
                {
                    "consignment_id": consignment_id,
                    "status": "",
                    "provider_status": notification,
                    "occurred_at": occurred,
                }
            ]

        provider_status = str(payload.get("status", "")).lower()
        return [
            {
                "consignment_id": consignment_id,
                "status": STATUS_MAP.get(provider_status or notification, ""),
                "provider_status": provider_status or notification,
                "occurred_at": occurred,
            }
        ]

    def _payload(self, shipment) -> dict[str, Any]:
        recipient = build_recipient(shipment)
        payload = {
            "invoice": shipment.order.order_number,
            "recipient_name": recipient.name[:100],
            "recipient_phone": recipient.phone,
            "recipient_address": recipient.address[:250],
            "cod_amount": float(cod_amount(shipment)),
            "note": self.config("note", ""),
            "delivery_type": int(self.config("delivery_type", HOME_DELIVERY)),
        }
        description = item_description(shipment)
        if description:
            payload["item_description"] = description
        payload["total_lot"] = total_quantity(shipment)
        return payload

    def _check(self, body: Any) -> dict[str, Any]:
        """Steadfast reports failures in the JSON body with a 200 transport
        status, so the body's own `status` is what has to be branched on."""
        if not isinstance(body, dict):
            raise CourierRejectedError(f"{self.carrier.name} returned an unexpected response body.")
        code = body.get("status")
        if code in (200, "200", None):
            return body
        detail = self._error_message(body) or f"status {code}"
        if str(code) == "401":
            raise CourierAuthError(f"{self.carrier.name} rejected the API credentials: {detail}.")
        if str(code) == "429":
            raise CourierRateLimitedError(f"{self.carrier.name} rate limit hit: {detail}.")
        raise CourierRejectedError(f"{self.carrier.name} rejected the request: {detail}.")
