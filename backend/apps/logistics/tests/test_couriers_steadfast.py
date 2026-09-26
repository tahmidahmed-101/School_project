from __future__ import annotations

import pytest

from apps.logistics.models import Carrier
from apps.logistics.services.couriers.exceptions import (
    CourierAuthError,
    CourierNotConfiguredError,
    CourierRateLimitedError,
    CourierRejectedError,
    CourierUnavailableError,
)
from apps.logistics.services.couriers.registry import get_gateway_for_carrier
from apps.logistics.services.couriers.steadfast import STATUS_MAP, SteadfastGateway
from apps.logistics.tests.helpers import (
    http_error,
    make_carrier,
    make_shipment,
    mock_http,
    sent_headers,
    sent_payload,
    sent_url,
)
from apps.orders.models import Shipment

pytestmark = pytest.mark.django_db

CREATED = {
    "status": 200,
    "message": "Consignment has been created successfully.",
    "consignment": {
        "consignment_id": 1424107,
        "invoice": "SO-00000001",
        "tracking_code": "15BAEB8A",
        "status": "in_review",
    },
}


def gateway(**overrides) -> SteadfastGateway:
    return get_gateway_for_carrier(make_carrier(Carrier.Provider.STEADFAST, **overrides))


def test_registry_returns_steadfast_gateway():
    assert isinstance(gateway(), SteadfastGateway)


def test_create_consignment_posts_documented_payload():
    courier = gateway()
    shipment = make_shipment(courier.carrier, quantity=3)

    with mock_http(CREATED) as mock:
        result = courier.create_consignment(shipment)

    assert sent_url(mock) == "https://portal.packzy.com/api/v1/create_order"
    payload = sent_payload(mock)
    assert payload["invoice"] == shipment.order.order_number
    assert payload["recipient_name"] == "Rahim Uddin"
    assert payload["recipient_phone"] == "01711111111"
    assert payload["recipient_address"] == "House 17/1, Road 3/A, Dhanmondi, Dhaka, 1209"
    assert payload["cod_amount"] == 1250.0
    assert payload["delivery_type"] == 0
    assert payload["total_lot"] == 3
    assert result["consignment_id"] == "1424107"
    assert result["tracking_code"] == "15BAEB8A"
    assert result["provider_status"] == "in_review"
    assert result["status"] == Shipment.Status.SHIPPED


def test_create_consignment_sends_static_key_headers_not_bearer():
    courier = gateway(api_key="key-abc", api_secret="secret-xyz")
    shipment = make_shipment(courier.carrier)

    with mock_http(CREATED) as mock:
        courier.create_consignment(shipment)

    headers = sent_headers(mock)
    assert headers["Api-key"] == "key-abc"
    assert headers["Secret-key"] == "secret-xyz"
    assert "Authorization" not in headers


def test_create_consignment_truncates_to_documented_field_limits():
    courier = gateway()
    shipment = make_shipment(courier.carrier)
    address = shipment.order.shipping_address
    address.full_name = "N" * 200
    address.line1 = "A" * 400
    address.save(update_fields=["full_name", "line1"])

    with mock_http(CREATED) as mock:
        courier.create_consignment(shipment)

    payload = sent_payload(mock)
    assert len(payload["recipient_name"]) == 100
    assert len(payload["recipient_address"]) == 250


def test_body_level_validation_error_raises_rejected():
    courier = gateway()
    shipment = make_shipment(courier.carrier)
    body = {
        "status": 400,
        "errors": {"recipient_phone": ["The recipient phone must be 11 digits."]},
    }

    with mock_http(body), pytest.raises(CourierRejectedError) as exc:
        courier.create_consignment(shipment)

    assert "recipient_phone" in exc.value.message


def test_body_level_401_raises_auth_error():
    courier = gateway()
    shipment = make_shipment(courier.carrier)

    with mock_http({"status": 401, "message": "Unauthorized"}), pytest.raises(CourierAuthError):
        courier.create_consignment(shipment)


def test_body_level_429_raises_rate_limited():
    courier = gateway()
    shipment = make_shipment(courier.carrier)

    with mock_http({"status": 429}), pytest.raises(CourierRateLimitedError):
        courier.create_consignment(shipment)


def test_missing_consignment_id_is_rejected_rather_than_stored_blank():
    courier = gateway()
    shipment = make_shipment(courier.carrier)

    with mock_http({"status": 200, "consignment": {}}), pytest.raises(CourierRejectedError):
        courier.create_consignment(shipment)


def test_transport_failure_raises_unavailable():
    courier = gateway()
    shipment = make_shipment(courier.carrier)

    with mock_http(TimeoutError("timed out")), pytest.raises(CourierUnavailableError):
        courier.create_consignment(shipment)


def test_http_level_error_is_classified():
    courier = gateway()
    shipment = make_shipment(courier.carrier)

    with (
        mock_http(http_error(429, {"message": "slow down"})),
        pytest.raises(CourierRateLimitedError),
    ):
        courier.create_consignment(shipment)


def test_disabled_integration_refuses_to_dispatch():
    courier = gateway(is_integration_enabled=False)
    shipment = make_shipment(courier.carrier)

    with pytest.raises(CourierNotConfiguredError):
        courier.create_consignment(shipment)


def test_missing_api_secret_refuses_to_dispatch():
    courier = gateway(api_secret="")
    shipment = make_shipment(courier.carrier)

    with pytest.raises(CourierNotConfiguredError):
        courier.create_consignment(shipment)


def test_order_without_shipping_address_is_rejected_before_any_call():
    courier = gateway()
    shipment = make_shipment(courier.carrier)
    shipment.order.shipping_address = None
    shipment.order.save(update_fields=["shipping_address"])

    with mock_http(CREATED) as mock, pytest.raises(CourierRejectedError):
        courier.create_consignment(shipment)

    assert mock.call_count == 0


def test_get_tracking_status_queries_by_consignment_id():
    courier = gateway()

    with mock_http({"status": 200, "delivery_status": "delivered"}) as mock:
        result = courier.get_tracking_status("1424107")

    assert sent_url(mock) == "https://portal.packzy.com/api/v1/status_by_cid/1424107"
    assert result["status"] == Shipment.Status.DELIVERED
    assert result["provider_status"] == "delivered"


@pytest.mark.parametrize(
    ("provider_status", "expected"),
    [
        ("in_review", Shipment.Status.SHIPPED),
        ("pending", Shipment.Status.IN_TRANSIT),
        ("hold", Shipment.Status.IN_TRANSIT),
        ("unknown", Shipment.Status.IN_TRANSIT),
        ("unknown_approval_pending", Shipment.Status.IN_TRANSIT),
        ("cancelled_approval_pending", Shipment.Status.IN_TRANSIT),
        ("delivered_approval_pending", Shipment.Status.OUT_FOR_DELIVERY),
        ("partial_delivered_approval_pending", Shipment.Status.OUT_FOR_DELIVERY),
        ("delivered", Shipment.Status.DELIVERED),
        ("partial_delivered", Shipment.Status.DELIVERED),
        ("cancelled", Shipment.Status.CANCELLED),
    ],
)
def test_every_documented_status_maps_to_a_domain_status(provider_status, expected):
    courier = gateway()

    with mock_http({"status": 200, "delivery_status": provider_status}):
        result = courier.get_tracking_status("1")

    assert result["status"] == expected


def test_status_map_covers_the_documented_vocabulary_and_nothing_else():
    documented = {
        "pending",
        "delivered_approval_pending",
        "partial_delivered_approval_pending",
        "cancelled_approval_pending",
        "unknown_approval_pending",
        "delivered",
        "partial_delivered",
        "cancelled",
        "hold",
        "in_review",
        "unknown",
    }
    assert set(STATUS_MAP) == documented
    assert set(STATUS_MAP.values()) <= set(Shipment.Status.values)


def test_undocumented_status_stays_unmapped():
    courier = gateway()

    with mock_http({"status": 200, "delivery_status": "teleported"}):
        result = courier.get_tracking_status("1")

    assert result["status"] == ""
    assert result["provider_status"] == "teleported"


def test_cancel_opens_a_return_request():
    courier = gateway()

    with mock_http({"status": 200}) as mock:
        assert courier.cancel_consignment("1424107") is True

    assert sent_url(mock).endswith("/create_return_request")
    assert sent_payload(mock) == {"consignment_id": "1424107"}


def test_every_call_carries_a_timeout():
    courier = gateway()

    with mock_http({"status": 200, "delivery_status": "pending"}) as mock:
        courier.get_tracking_status("1")

    assert mock.calls[0][1] == 15
