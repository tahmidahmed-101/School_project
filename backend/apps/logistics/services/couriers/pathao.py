from __future__ import annotations

from typing import Any

from django.core.cache import cache
from django.utils import timezone
from django.utils.crypto import constant_time_compare

from apps.orders.models import Shipment

from .exceptions import CourierAuthError, CourierNotConfiguredError, CourierRejectedError
from .http import HttpCourierGateway, parse_courier_datetime
from .recipient import (
    build_recipient,
    cod_amount,
    item_description,
    total_quantity,
    total_weight,
)

SANDBOX_BASE_URL = "https://courier-api-sandbox.pathao.com"
PRODUCTION_BASE_URL = "https://api-hermes.pathao.com"

API_PREFIX = "/aladdin/api/v1"

DELIVERY_TYPE_NORMAL = 48
DELIVERY_TYPE_ON_DEMAND = 12
ITEM_TYPE_DOCUMENT = 1
ITEM_TYPE_PARCEL = 2

MIN_ITEM_WEIGHT_KG = 0.5
MAX_ITEM_WEIGHT_KG = 10.0

# Token lifetime is 5 days; re-issue early so an in-flight dispatch never races
# the expiry. See docs/couriers.md.
TOKEN_REFRESH_MARGIN_SECONDS = 300

# Derived from Pathao's webhook event list, which is the only status vocabulary
# they publish — see the "unverified" section of docs/couriers.md.
STATUS_MAP: dict[str, str] = {
    "pending": Shipment.Status.SHIPPED,
    "pickup-requested": Shipment.Status.SHIPPED,
    "assigned-for-pickup": Shipment.Status.SHIPPED,
    "picked": Shipment.Status.IN_TRANSIT,
    "at-the-sorting-hub": Shipment.Status.IN_TRANSIT,
    "in-transit": Shipment.Status.IN_TRANSIT,
    "received-at-last-mile-hub": Shipment.Status.IN_TRANSIT,
    "on-hold": Shipment.Status.IN_TRANSIT,
    "return-in-transit": Shipment.Status.IN_TRANSIT,
    "assigned-for-delivery": Shipment.Status.OUT_FOR_DELIVERY,
    "delivered": Shipment.Status.DELIVERED,
    "partial-delivery": Shipment.Status.DELIVERED,
    "paid": Shipment.Status.DELIVERED,
    "exchanged": Shipment.Status.DELIVERED,
    "returned": Shipment.Status.RETURNED,
    "returned-to-merchant": Shipment.Status.RETURNED,
    "paid-return": Shipment.Status.RETURNED,
    "delivery-failed": Shipment.Status.FAILED,
    "pickup-failed": Shipment.Status.FAILED,
    "pickup-cancelled": Shipment.Status.CANCELLED,
}


def normalise_status(value: str) -> str:
    return value.strip().lower().replace("_", "-").replace(" ", "-")


class PathaoGateway(HttpCourierGateway):
    """Pathao Courier. Unlike the other two providers this is OAuth2
    client-credentials with a password grant, so every call is preceded by a
    cached token lookup. See docs/couriers.md."""

    default_base_url = PRODUCTION_BASE_URL
    requires_api_secret = True

    @property
    def base_url(self) -> str:
        configured = self.carrier.api_base_url
        if configured:
            return configured.rstrip("/")
        if self.config("sandbox", False):
            return SANDBOX_BASE_URL
        return PRODUCTION_BASE_URL

    @property
    def _token_cache_key(self) -> str:
        return f"courier:pathao:token:{self.carrier.pk}"

    def _require_configured(self) -> None:
        super()._require_configured()
        if not self.config("username") or not self.config("password"):
            raise CourierNotConfiguredError(
                f"{self.carrier.name} needs the merchant `username` and `password` "
                "in its config — Pathao's token grant requires them alongside the "
                "client id and secret.",
            )
        if not self.config("store_id"):
            raise CourierNotConfiguredError(
                f"{self.carrier.name} needs a `store_id` in its config. Look it up "
                "with `list_stores()`; it cannot be guessed.",
            )

    def _auth_headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._access_token()}"}

    def _access_token(self, *, force_refresh: bool = False) -> str:
        if not force_refresh:
            cached = cache.get(self._token_cache_key)
            if cached:
                return cached
        return self._issue_token()

    def _issue_token(self, refresh_token: str | None = None) -> str:
        payload = {
            "client_id": self.carrier.api_key,
            "client_secret": self.carrier.api_secret,
        }
        if refresh_token:
            payload |= {"grant_type": "refresh_token", "refresh_token": refresh_token}
        else:
            payload |= {
                "grant_type": "password",
                "username": self.config("username"),
                "password": self.config("password"),
            }

        body = self._request("POST", f"{API_PREFIX}/issue-token", payload, authenticated=False)
        token = (body or {}).get("access_token") if isinstance(body, dict) else None
        if not token:
            raise CourierAuthError(
                f"{self.carrier.name} did not return an access token for the "
                "configured credentials."
            )
        expires_in = int(body.get("expires_in") or 0)
        ttl = max(expires_in - TOKEN_REFRESH_MARGIN_SECONDS, 60)
        cache.set(self._token_cache_key, token, ttl)
        return token

    def _authed_request(self, method: str, path: str, payload: Any = None, **kwargs) -> Any:
        """One retry only, and only on auth failure: a cached token can expire
        between the lookup and the call, but a genuinely bad credential must
        not be retried in a loop."""
        try:
            return self._request(method, path, payload, **kwargs)
        except CourierAuthError:
            cache.delete(self._token_cache_key)
            self._access_token(force_refresh=True)
            return self._request(method, path, payload, **kwargs)

    def create_consignment(self, shipment) -> dict[str, Any]:
        self._require_configured()
        body = self._authed_request("POST", f"{API_PREFIX}/orders", self._payload(shipment))
        data = body.get("data") if isinstance(body, dict) else None
        consignment_id = (data or {}).get("consignment_id")
        if not consignment_id:
            raise CourierRejectedError(
                f"{self.carrier.name} accepted the order but returned no consignment id."
            )
        provider_status = str((data or {}).get("order_status") or "")
        return {
            "consignment_id": str(consignment_id),
            "status": STATUS_MAP.get(normalise_status(provider_status), ""),
            "provider_status": provider_status,
            "delivery_fee": (data or {}).get("delivery_fee"),
        }

    def get_tracking_status(self, consignment_id: str) -> dict[str, Any]:
        self._require_configured()
        body = self._authed_request("GET", f"{API_PREFIX}/orders/{consignment_id}/info")
        data = body.get("data") if isinstance(body, dict) else {}
        provider_status = str((data or {}).get("order_status") or "")
        return {
            "consignment_id": str(consignment_id),
            "status": STATUS_MAP.get(normalise_status(provider_status), ""),
            "provider_status": provider_status,
        }

    def cancel_consignment(self, consignment_id: str) -> bool:
        raise CourierRejectedError(
            f"{self.carrier.name} orders cannot be cancelled through the merchant "
            "API — cancel it from the Pathao merchant panel.",
            code="cancel_not_supported",
        )

    def verify_webhook(self, headers: dict[str, str], query: dict[str, str], body: bytes) -> bool:
        expected = self.carrier.webhook_secret
        supplied = headers.get("X-PATHAO-Signature", "")
        return bool(expected) and constant_time_compare(expected, supplied)

    def webhook_ack(self) -> tuple[int, dict[str, str], dict[str, Any]]:
        # Pathao's webhook setup handshake expects its own registered
        # integration secret echoed back in this header — assigned per
        # merchant in the Pathao portal, not something we choose.
        integration_secret = self.config("webhook_integration_secret")
        if integration_secret:
            return 202, {"X-Pathao-Merchant-Webhook-Integration-Secret": integration_secret}, {}
        return 202, {}, {}

    def parse_webhook(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        event = str(payload.get("event", ""))
        return [
            {
                "consignment_id": str(payload.get("consignment_id", "")),
                "status": STATUS_MAP.get(normalise_status(event), ""),
                "provider_status": event,
                "occurred_at": (
                    parse_courier_datetime(payload.get("timestamp"))
                    or parse_courier_datetime(payload.get("updated_at"))
                    or timezone.now()
                ),
            }
        ]

    def list_stores(self) -> list[dict[str, Any]]:
        self._require_configured()
        return self._paged(f"{API_PREFIX}/stores")

    def list_cities(self) -> list[dict[str, Any]]:
        self._require_configured()
        return self._paged(f"{API_PREFIX}/countries/1/city-list")

    def list_zones(self, city_id: int) -> list[dict[str, Any]]:
        self._require_configured()
        return self._paged(f"{API_PREFIX}/cities/{city_id}/zone-list")

    def list_areas(self, zone_id: int) -> list[dict[str, Any]]:
        self._require_configured()
        return self._paged(f"{API_PREFIX}/zones/{zone_id}/area-list")

    def _paged(self, path: str) -> list[dict[str, Any]]:
        body = self._authed_request("GET", path)
        data = body.get("data") if isinstance(body, dict) else {}
        rows = data.get("data") if isinstance(data, dict) else data
        return rows if isinstance(rows, list) else []

    def _payload(self, shipment) -> dict[str, Any]:
        recipient = build_recipient(shipment)
        payload = {
            "store_id": int(self.config("store_id")),
            "merchant_order_id": shipment.order.order_number,
            "recipient_name": recipient.name[:100],
            "recipient_phone": recipient.phone,
            "recipient_address": recipient.address[:220],
            "delivery_type": int(self.config("delivery_type", DELIVERY_TYPE_NORMAL)),
            "item_type": int(self.config("item_type", ITEM_TYPE_PARCEL)),
            "item_quantity": total_quantity(shipment),
            "item_weight": self._weight(shipment),
            "amount_to_collect": int(cod_amount(shipment)),
        }
        description = item_description(shipment)
        if description:
            payload["item_description"] = description
        instruction = self.config("special_instruction")
        if instruction:
            payload["special_instruction"] = instruction
        # recipient_city/zone/area are intentionally omitted so Pathao resolves
        # them from the address — sending an explicit null is rejected.
        return payload

    def _weight(self, shipment) -> float:
        weight = float(total_weight(shipment)) or float(
            self.config("default_item_weight_kg", MIN_ITEM_WEIGHT_KG)
        )
        return round(min(max(weight, MIN_ITEM_WEIGHT_KG), MAX_ITEM_WEIGHT_KG), 3)
