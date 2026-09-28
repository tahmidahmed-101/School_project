from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.utils import timezone
from django.utils.crypto import constant_time_compare

from apps.orders.models import Shipment

from .exceptions import CourierNotConfiguredError, CourierRejectedError
from .http import HttpCourierGateway, parse_courier_datetime
from .recipient import (
    build_recipient,
    cod_amount,
    item_description,
    total_weight,
)

SANDBOX_BASE_URL = "https://sandbox.redx.com.bd/v1.0.0-beta"
PRODUCTION_BASE_URL = "https://openapi.redx.com.bd/v1.0.0-beta"

DEFAULT_PARCEL_WEIGHT_GRAMS = 500

# RedX does not publish the full parcel vocabulary, so unknown values stay
# unmapped rather than being forced onto a domain status. See docs/couriers.md.
STATUS_MAP: dict[str, str] = {
    "pickup-pending": Shipment.Status.SHIPPED,
    "ready-for-delivery": Shipment.Status.IN_TRANSIT,
    "agent-hold": Shipment.Status.IN_TRANSIT,
    "agent-area-change": Shipment.Status.IN_TRANSIT,
    "agent-returning": Shipment.Status.IN_TRANSIT,
    "delivery-in-progress": Shipment.Status.OUT_FOR_DELIVERY,
    "delivered": Shipment.Status.DELIVERED,
    "paid": Shipment.Status.DELIVERED,
    "returned": Shipment.Status.RETURNED,
    "cancelled": Shipment.Status.CANCELLED,
}


class RedXGateway(HttpCourierGateway):
    """RedX OpenAPI. The access token is a static JWT issued from the merchant
    panel — there is no token endpoint on the OpenAPI host. See
    docs/couriers.md."""

    default_base_url = PRODUCTION_BASE_URL

    @property
    def base_url(self) -> str:
        configured = self.carrier.api_base_url
        if configured:
            return configured.rstrip("/")
        return SANDBOX_BASE_URL if self.config("sandbox", False) else PRODUCTION_BASE_URL

    def _auth_headers(self) -> dict[str, str]:
        return {"API-ACCESS-TOKEN": f"Bearer {self.carrier.api_key}"}

    def _require_configured(self) -> None:
        super()._require_configured()
        if not self.config("delivery_area_id") and not self.config("area_id_by_city"):
            raise CourierNotConfiguredError(
                f"{self.carrier.name} needs a `delivery_area_id` (or an "
                "`area_id_by_city` map) in its config. Look ids up with "
                "`list_areas()`; RedX rejects an unknown area.",
            )

    def create_consignment(self, shipment) -> dict[str, Any]:
        self._require_configured()
        body = self._request("POST", "/parcel", self._payload(shipment))
        tracking_id = body.get("tracking_id") if isinstance(body, dict) else None
        if not tracking_id:
            raise CourierRejectedError(
                f"{self.carrier.name} accepted the parcel but returned no tracking id."
            )
        return {
            "consignment_id": str(tracking_id),
            "status": Shipment.Status.SHIPPED,
            "provider_status": "",
        }

    def get_tracking_status(self, consignment_id: str) -> dict[str, Any]:
        """Reads /parcel/info rather than /parcel/track: only info carries a
        machine-readable `status`, track returns bilingual prose."""
        self._require_configured()
        body = self._request("GET", f"/parcel/info/{consignment_id}")
        parcel = body.get("parcel") if isinstance(body, dict) else {}
        provider_status = str((parcel or {}).get("status") or "")
        return {
            "consignment_id": str(consignment_id),
            "status": STATUS_MAP.get(provider_status, ""),
            "provider_status": provider_status,
        }

    def cancel_consignment(self, consignment_id: str) -> bool:
        self._require_configured()
        self._request(
            "PATCH",
            "/parcels",
            {
                "entity_type": "parcel-tracking-id",
                "entity_id": str(consignment_id),
                "update_details": {
                    "property_name": "status",
                    "new_value": "cancelled",
                    "reason": self.config("cancel_reason", "Cancelled by merchant"),
                },
            },
        )
        return True

    def verify_webhook(self, headers: dict[str, str], query: dict[str, str], body: bytes) -> bool:
        # RedX has no signature header: the shared secret rides in the
        # callback URL's query string, which is why that URL must never be
        # logged.
        expected = self.carrier.webhook_secret
        return bool(expected) and constant_time_compare(expected, query.get("token", ""))

    def parse_webhook(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        provider_status = str(payload.get("status", ""))
        return [
            {
                "consignment_id": str(payload.get("tracking_number", "")),
                "status": STATUS_MAP.get(provider_status, ""),
                "provider_status": provider_status,
                "occurred_at": parse_courier_datetime(payload.get("timestamp")) or timezone.now(),
            }
        ]

    def list_areas(self, **filters) -> list[dict[str, Any]]:
        self._require_configured()
        body = self._request("GET", "/areas", params=filters or None)
        areas = body.get("areas") if isinstance(body, dict) else None
        return areas if isinstance(areas, list) else []

    def list_pickup_stores(self) -> list[dict[str, Any]]:
        self._require_configured()
        body = self._request("GET", "/pickup/stores")
        stores = body.get("pickup_stores") if isinstance(body, dict) else None
        return stores if isinstance(stores, list) else []

    def _payload(self, shipment) -> dict[str, Any]:
        recipient = build_recipient(shipment)
        area_id, area_name = self._area_for(recipient.city)
        declared_value = Decimal(shipment.order.grand_total or 0) or cod_amount(shipment)
        payload = {
            "customer_name": recipient.name,
            "customer_phone": recipient.phone,
            "delivery_area": area_name,
            "delivery_area_id": int(area_id),
            "customer_address": recipient.address,
            "merchant_invoice_id": shipment.order.order_number,
            "cash_collection_amount": str(cod_amount(shipment)),
            "parcel_weight": self._weight_grams(shipment),
            "value": str(declared_value),
        }
        instruction = self.config("instruction")
        if instruction:
            payload["instruction"] = instruction
        pickup_store_id = self.config("pickup_store_id")
        if pickup_store_id:
            payload["pickup_store_id"] = str(pickup_store_id)
        description = item_description(shipment)
        if description:
            payload["parcel_details_json"] = [
                {
                    "name": description[:100],
                    "category": self.config("parcel_category", "general"),
                    "value": int(declared_value),
                }
            ]
        return payload

    def _area_for(self, city: str) -> tuple[int, str]:
        by_city = self.config("area_id_by_city") or {}
        if isinstance(by_city, dict) and city:
            match = by_city.get(city) or by_city.get(city.lower())
            if match:
                return int(match), city
        area_id = self.config("delivery_area_id")
        if not area_id:
            raise CourierNotConfiguredError(
                f"{self.carrier.name} has no delivery area configured for '{city}'."
            )
        return int(area_id), str(self.config("delivery_area", city))

    def _weight_grams(self, shipment) -> int:
        kilograms = total_weight(shipment)
        if kilograms:
            return max(int(kilograms * 1000), 1)
        return int(self.config("default_parcel_weight_grams", DEFAULT_PARCEL_WEIGHT_GRAMS))
