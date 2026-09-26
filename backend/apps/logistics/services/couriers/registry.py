from __future__ import annotations

from apps.logistics.models import Carrier

from .base import CourierGateway
from .providers import ManualGateway, PathaoGateway, RedXGateway, SteadfastGateway

_GATEWAYS: dict[str, type[CourierGateway]] = {
    Carrier.Provider.PATHAO: PathaoGateway,
    Carrier.Provider.STEADFAST: SteadfastGateway,
    Carrier.Provider.REDX: RedXGateway,
    Carrier.Provider.MANUAL: ManualGateway,
}


def get_gateway_for_carrier(carrier: Carrier) -> CourierGateway:
    gateway_cls = _GATEWAYS.get(carrier.code, ManualGateway)
    return gateway_cls(carrier)
