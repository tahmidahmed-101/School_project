from __future__ import annotations

import pytest

from apps.logistics.models import Carrier
from apps.logistics.services.couriers.exceptions import (
    CourierNotConfiguredError,
    CourierRejectedError,
    CourierUnavailableError,
)
from apps.logistics.services.couriers.providers import ManualGateway
from apps.logistics.services.couriers.registry import get_gateway_for_carrier
from apps.logistics.tests.helpers import http_error, make_carrier, make_shipment, mock_http
from apps.orders.services.shipments import dispatch_to_courier

pytestmark = pytest.mark.django_db


def test_manual_carrier_gets_the_manual_gateway():
    carrier = make_carrier(Carrier.Provider.MANUAL)
    assert isinstance(get_gateway_for_carrier(carrier), ManualGateway)


def test_unknown_carrier_code_falls_back_to_manual():
    carrier = make_carrier("")
    assert isinstance(get_gateway_for_carrier(carrier), ManualGateway)


def test_manual_gateway_refuses_every_operation():
    courier = get_gateway_for_carrier(make_carrier(Carrier.Provider.MANUAL))
    shipment = make_shipment(courier.carrier)

    with pytest.raises(CourierNotConfiguredError):
        courier.create_consignment(shipment)
    with pytest.raises(CourierNotConfiguredError):
        courier.get_tracking_status("X")
    with pytest.raises(CourierNotConfiguredError):
        courier.cancel_consignment("X")


def test_base_gateway_sends_no_authorization_header_of_its_own():
    """The generic Bearer assumption is wrong for all three providers, so the
    shared layer must contribute no auth at all."""
    from apps.logistics.services.couriers.http import HttpCourierGateway

    carrier = make_carrier(Carrier.Provider.MANUAL)
    assert HttpCourierGateway(carrier)._auth_headers() == {}


def test_failed_dispatch_leaves_the_shipment_untouched():
    courier = get_gateway_for_carrier(make_carrier(Carrier.Provider.STEADFAST, api_secret="s"))
    shipment = make_shipment(courier.carrier)
    original_tracking = shipment.tracking_number

    with mock_http(TimeoutError("boom")), pytest.raises(CourierUnavailableError):
        dispatch_to_courier(shipment=shipment)

    shipment.refresh_from_db()
    assert shipment.tracking_number == original_tracking
    assert shipment.courier_status == ""


def test_rejected_dispatch_leaves_the_shipment_untouched():
    courier = get_gateway_for_carrier(make_carrier(Carrier.Provider.STEADFAST, api_secret="s"))
    shipment = make_shipment(courier.carrier)
    original_tracking = shipment.tracking_number

    with mock_http(http_error(422, {"message": "nope"})), pytest.raises(CourierRejectedError):
        dispatch_to_courier(shipment=shipment)

    shipment.refresh_from_db()
    assert shipment.tracking_number == original_tracking


def test_successful_dispatch_stores_the_consignment_id():
    courier = get_gateway_for_carrier(make_carrier(Carrier.Provider.STEADFAST, api_secret="s"))
    shipment = make_shipment(courier.carrier)
    body = {"status": 200, "consignment": {"consignment_id": 42, "status": "in_review"}}

    with mock_http(body):
        dispatch_to_courier(shipment=shipment)

    shipment.refresh_from_db()
    assert shipment.tracking_number == "42"
    assert shipment.courier_status == "shipped"
