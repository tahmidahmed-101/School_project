from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from apps.logistics.models import Carrier
    from apps.orders.models import Shipment


class CourierGateway(ABC):
    """Interface every courier integration implements. Concrete gateways
    live in providers.py; `registry.get_gateway_for_carrier()` picks the
    right one from `Carrier.code`."""

    def __init__(self, carrier: Carrier) -> None:
        self.carrier = carrier

    @abstractmethod
    def create_consignment(self, shipment: Shipment) -> dict[str, Any]:
        """Register the shipment with the courier. Must return at least
        `{"consignment_id": str, "status": str, "provider_status": str}`, where
        `status` is a `Shipment.Status` value ("" when the provider's own status
        has no safe domain equivalent) and `provider_status` is the raw string."""

    @abstractmethod
    def get_tracking_status(self, consignment_id: str) -> dict[str, Any]:
        """Fetch the current status for a previously created consignment.
        Returns the same `status`/`provider_status` pair as create."""

    @abstractmethod
    def cancel_consignment(self, consignment_id: str) -> bool:
        """Cancel a previously created consignment. Returns success."""

    def verify_webhook(self, headers: dict[str, str], query: dict[str, str], body: bytes) -> bool:
        """Reject a delivery that does not carry this carrier's secret.
        Providers with no webhook feed leave this raising."""
        raise NotImplementedError

    def parse_webhook(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        """One dict per tracking event, each shaped like `get_tracking_status`'s
        return plus `occurred_at` — `status`/`provider_status` (`status` empty
        when unmapped) and `occurred_at` a timezone-aware datetime."""
        raise NotImplementedError

    def webhook_ack(self) -> tuple[int, dict[str, str], dict[str, Any]]:
        """Status code, extra headers and body this courier requires in reply."""
        return 200, {}, {"status": "success"}
