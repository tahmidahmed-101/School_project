from __future__ import annotations

from typing import TYPE_CHECKING, Any

from .base import CourierGateway
from .exceptions import CourierNotConfiguredError
from .http import HttpCourierGateway
from .pathao import PathaoGateway
from .redx import RedXGateway
from .steadfast import SteadfastGateway

if TYPE_CHECKING:
    from apps.orders.models import Shipment

__all__ = [
    "HttpCourierGateway",
    "ManualGateway",
    "PathaoGateway",
    "RedXGateway",
    "SteadfastGateway",
]


class ManualGateway(CourierGateway):
    """Fallback for carriers with no live integration — tracking numbers are
    entered by hand on the shipment, nothing is called out to."""

    def create_consignment(self, shipment: Shipment) -> dict[str, Any]:
        raise CourierNotConfiguredError(
            f"{self.carrier.name} has no courier integration enabled — "
            "enter the tracking number manually on the shipment.",
        )

    def get_tracking_status(self, consignment_id: str) -> dict[str, Any]:
        raise CourierNotConfiguredError(
            f"{self.carrier.name} has no courier integration enabled.",
        )

    def cancel_consignment(self, consignment_id: str) -> bool:
        raise CourierNotConfiguredError(
            f"{self.carrier.name} has no courier integration enabled.",
        )
