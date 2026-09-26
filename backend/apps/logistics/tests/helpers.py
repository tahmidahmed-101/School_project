from __future__ import annotations

import json
import urllib.error
from contextlib import contextmanager
from decimal import Decimal
from typing import Any
from unittest.mock import patch

from apps.accounts.factories import AddressFactory
from apps.logistics.factories import CarrierFactory
from apps.logistics.models import Carrier
from apps.orders.factories import (
    SalesOrderFactory,
    SalesOrderLineFactory,
    ShipmentFactory,
    ShipmentLineFactory,
)

URLOPEN = "apps.logistics.services.couriers.http.urllib.request.urlopen"


class FakeResponse:
    def __init__(self, payload: Any) -> None:
        self._body = b"" if payload is None else json.dumps(payload).encode()

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args) -> bool:
        return False


def http_error(status_code: int, payload: Any = None) -> urllib.error.HTTPError:
    body = json.dumps(payload or {}).encode()
    error = urllib.error.HTTPError("https://courier.test/x", status_code, "err", {}, None)
    error.read = lambda: body  # type: ignore[method-assign]
    return error


@contextmanager
def mock_http(*responses: Any):
    """Patches the gateway's urlopen. Each element is either a payload to
    return or an exception to raise, consumed in order."""
    calls: list[Any] = []

    def side_effect(request, timeout=None):
        calls.append((request, timeout))
        index = min(len(calls) - 1, len(responses) - 1)
        outcome = responses[index]
        if isinstance(outcome, BaseException):
            raise outcome
        return FakeResponse(outcome)

    with patch(URLOPEN, side_effect=side_effect) as mock:
        mock.calls = calls
        yield mock


def sent_payload(mock, index: int = 0) -> dict:
    request = mock.calls[index][0]
    return json.loads(request.data.decode())


def sent_headers(mock, index: int = 0) -> dict:
    return dict(mock.calls[index][0].header_items())


def sent_url(mock, index: int = 0) -> str:
    return mock.calls[index][0].full_url


def make_carrier(code: str, **overrides) -> Carrier:
    defaults = {
        "code": code,
        "api_key": "test-key",
        "api_secret": "test-secret",
        "is_integration_enabled": True,
        "config": {},
    }
    defaults.update(overrides)
    return CarrierFactory(**defaults)


def make_shipment(carrier: Carrier, *, cod=Decimal("1250.00"), weight=None, quantity=2):
    address = AddressFactory(
        full_name="Rahim Uddin",
        phone="01711111111",
        line1="House 17/1, Road 3/A",
        line2="Dhanmondi",
        city="Dhaka",
        postal_code="1209",
        country="BD",
    )
    order = SalesOrderFactory(
        customer=address.user,
        shipping_address=address,
        grand_total=Decimal("2000.00"),
    )
    line = SalesOrderLineFactory(order=order, quantity=quantity)
    if weight is not None:
        line.variant.weight = weight
        line.variant.save(update_fields=["weight"])
    shipment = ShipmentFactory(order=order, carrier=carrier, cod_amount=cod)
    ShipmentLineFactory(shipment=shipment, order_line=line, quantity=quantity)
    return shipment
