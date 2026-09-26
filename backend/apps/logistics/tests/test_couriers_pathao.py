from __future__ import annotations

from decimal import Decimal

import pytest
from django.core.cache import cache

from apps.logistics.models import Carrier
from apps.logistics.services.couriers.exceptions import (
    CourierAuthError,
    CourierNotConfiguredError,
    CourierRateLimitedError,
    CourierRejectedError,
    CourierUnavailableError,
)
from apps.logistics.services.couriers.pathao import (
    PRODUCTION_BASE_URL,
    SANDBOX_BASE_URL,
    STATUS_MAP,
    PathaoGateway,
)
from apps.logistics.services.couriers.registry import get_gateway_for_carrier
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

CONFIG = {"username": "merchant@example.com", "password": "s3cret", "store_id": 4321}

TOKEN = {
    "token_type": "Bearer",
    "expires_in": 432000,
    "access_token": "access-1",
    "refresh_token": "refresh-1",
}

CREATED = {
    "message": "Order Created Successfully",
    "type": "success",
    "code": 200,
    "data": {
        "consignment_id": "DL121224VS8TTJ",
        "merchant_order_id": "SO-00000001",
        "order_status": "Pending",
        "delivery_fee": 80,
    },
}


@pytest.fixture(autouse=True)
def _clear_token_cache():
    cache.clear()
    yield
    cache.clear()


def gateway(config=None, **overrides) -> PathaoGateway:
    carrier = make_carrier(
        Carrier.Provider.PATHAO, config={**CONFIG, **(config or {})}, **overrides
    )
    return get_gateway_for_carrier(carrier)


def test_registry_returns_pathao_gateway():
    assert isinstance(gateway(), PathaoGateway)


def test_issue_token_uses_password_grant():
    courier = gateway(api_key="client-id", api_secret="client-secret")
    shipment = make_shipment(courier.carrier)

    with mock_http(TOKEN, CREATED) as mock:
        courier.create_consignment(shipment)

    assert sent_url(mock, 0) == f"{PRODUCTION_BASE_URL}/aladdin/api/v1/issue-token"
    assert sent_payload(mock, 0) == {
        "client_id": "client-id",
        "client_secret": "client-secret",
        "grant_type": "password",
        "username": "merchant@example.com",
        "password": "s3cret",
    }
    assert "Authorization" not in sent_headers(mock, 0)


def test_order_call_carries_the_bearer_token():
    courier = gateway()
    shipment = make_shipment(courier.carrier)

    with mock_http(TOKEN, CREATED) as mock:
        courier.create_consignment(shipment)

    assert sent_headers(mock, 1)["Authorization"] == "Bearer access-1"


def test_token_is_cached_across_calls():
    courier = gateway()
    shipment = make_shipment(courier.carrier)

    with mock_http(TOKEN, CREATED) as mock:
        courier.create_consignment(shipment)
        courier.create_consignment(shipment)

    urls = [sent_url(mock, i) for i in range(len(mock.calls))]
    assert sum(url.endswith("/issue-token") for url in urls) == 1


def test_token_cache_is_per_carrier():
    first = gateway()
    second = gateway()
    assert first._token_cache_key != second._token_cache_key


def test_expired_token_is_reissued_once_then_the_call_is_retried():
    courier = gateway()
    shipment = make_shipment(courier.carrier)
    responses = [TOKEN, http_error(401, {"message": "expired"}), TOKEN, CREATED]

    with mock_http(*responses) as mock:
        result = courier.create_consignment(shipment)

    assert result["consignment_id"] == "DL121224VS8TTJ"
    urls = [sent_url(mock, i) for i in range(len(mock.calls))]
    assert sum(url.endswith("/issue-token") for url in urls) == 2


def test_auth_retry_is_not_unbounded():
    courier = gateway()
    shipment = make_shipment(courier.carrier)

    with (
        mock_http(TOKEN, http_error(401, {}), TOKEN, http_error(401, {})) as mock,
        pytest.raises(CourierAuthError),
    ):
        courier.create_consignment(shipment)

    assert len(mock.calls) == 4


def test_token_response_without_access_token_raises_auth_error():
    courier = gateway()
    shipment = make_shipment(courier.carrier)

    with mock_http({"token_type": "Bearer"}), pytest.raises(CourierAuthError):
        courier.create_consignment(shipment)


def test_create_order_posts_documented_payload():
    courier = gateway()
    shipment = make_shipment(courier.carrier, quantity=3, weight=Decimal("1.500"))

    with mock_http(TOKEN, CREATED) as mock:
        result = courier.create_consignment(shipment)

    assert sent_url(mock, 1) == f"{PRODUCTION_BASE_URL}/aladdin/api/v1/orders"
    payload = sent_payload(mock, 1)
    assert payload["store_id"] == 4321
    assert payload["merchant_order_id"] == shipment.order.order_number
    assert payload["recipient_name"] == "Rahim Uddin"
    assert payload["recipient_phone"] == "01711111111"
    assert payload["recipient_address"] == "House 17/1, Road 3/A, Dhanmondi, Dhaka, 1209"
    assert payload["delivery_type"] == 48
    assert payload["item_type"] == 2
    assert payload["item_quantity"] == 3
    assert payload["item_weight"] == 4.5
    assert payload["amount_to_collect"] == 1250
    assert result["consignment_id"] == "DL121224VS8TTJ"
    assert result["delivery_fee"] == 80


def test_recipient_location_ids_are_omitted_not_nulled():
    courier = gateway()
    shipment = make_shipment(courier.carrier)

    with mock_http(TOKEN, CREATED) as mock:
        courier.create_consignment(shipment)

    payload = sent_payload(mock, 1)
    assert "recipient_city" not in payload
    assert "recipient_zone" not in payload
    assert "recipient_area" not in payload


def test_item_weight_is_clamped_to_the_documented_range():
    courier = gateway()
    heavy = make_shipment(courier.carrier, quantity=100, weight=Decimal("5"))
    light = make_shipment(courier.carrier, quantity=1, weight=Decimal("0.001"))

    with mock_http(TOKEN, CREATED) as mock:
        courier.create_consignment(heavy)
        courier.create_consignment(light)

    assert sent_payload(mock, 1)["item_weight"] == 10.0
    assert sent_payload(mock, 2)["item_weight"] == 0.5


def test_weightless_shipment_falls_back_to_configured_default():
    courier = gateway({"default_item_weight_kg": 2})
    shipment = make_shipment(courier.carrier)

    with mock_http(TOKEN, CREATED) as mock:
        courier.create_consignment(shipment)

    assert sent_payload(mock, 1)["item_weight"] == 2.0


def test_sandbox_flag_selects_the_sandbox_host():
    courier = gateway({"sandbox": True})
    shipment = make_shipment(courier.carrier)

    with mock_http(TOKEN, CREATED) as mock:
        courier.create_consignment(shipment)

    assert sent_url(mock, 0).startswith(SANDBOX_BASE_URL)


def test_explicit_base_url_overrides_both_defaults():
    courier = gateway({"sandbox": True}, api_base_url="https://courier.internal/")
    shipment = make_shipment(courier.carrier)

    with mock_http(TOKEN, CREATED) as mock:
        courier.create_consignment(shipment)

    assert sent_url(mock, 0).startswith("https://courier.internal/aladdin")


def test_missing_store_id_refuses_to_dispatch():
    courier = gateway({"store_id": None})
    shipment = make_shipment(courier.carrier)

    with mock_http(TOKEN, CREATED) as mock, pytest.raises(CourierNotConfiguredError):
        courier.create_consignment(shipment)

    assert mock.call_count == 0


def test_missing_merchant_password_refuses_to_dispatch():
    courier = gateway({"password": ""})
    shipment = make_shipment(courier.carrier)

    with pytest.raises(CourierNotConfiguredError):
        courier.create_consignment(shipment)


def test_validation_error_raises_rejected_with_field_detail():
    courier = gateway()
    shipment = make_shipment(courier.carrier)
    error = http_error(
        422,
        {
            "type": "error",
            "code": 422,
            "message": "Validation error",
            "errors": {"recipient_phone": ["Invalid phone"]},
        },
    )

    with mock_http(TOKEN, error), pytest.raises(CourierRejectedError) as exc:
        courier.create_consignment(shipment)

    assert "recipient_phone" in exc.value.message


def test_rate_limit_raises_rate_limited():
    courier = gateway()
    shipment = make_shipment(courier.carrier)

    with mock_http(TOKEN, http_error(429, {})), pytest.raises(CourierRateLimitedError):
        courier.create_consignment(shipment)


def test_server_error_raises_unavailable():
    courier = gateway()
    shipment = make_shipment(courier.carrier)

    with mock_http(TOKEN, http_error(503, {})), pytest.raises(CourierUnavailableError):
        courier.create_consignment(shipment)


def test_network_failure_raises_unavailable():
    courier = gateway()
    shipment = make_shipment(courier.carrier)

    with mock_http(TimeoutError("timed out")), pytest.raises(CourierUnavailableError):
        courier.create_consignment(shipment)


def test_response_without_consignment_id_is_rejected():
    courier = gateway()
    shipment = make_shipment(courier.carrier)

    with mock_http(TOKEN, {"code": 200, "data": {}}), pytest.raises(CourierRejectedError):
        courier.create_consignment(shipment)


def test_get_tracking_status_reads_the_info_endpoint():
    courier = gateway()
    body = {"code": 200, "data": {"order_status": "Delivered"}}

    with mock_http(TOKEN, body) as mock:
        result = courier.get_tracking_status("DL121224VS8TTJ")

    assert sent_url(mock, 1).endswith("/aladdin/api/v1/orders/DL121224VS8TTJ/info")
    assert result["status"] == Shipment.Status.DELIVERED
    assert result["provider_status"] == "Delivered"


@pytest.mark.parametrize(
    ("provider_status", "expected"),
    [
        ("Pending", Shipment.Status.SHIPPED),
        ("Pickup-Requested", Shipment.Status.SHIPPED),
        ("assigned_for_pickup", Shipment.Status.SHIPPED),
        ("Picked", Shipment.Status.IN_TRANSIT),
        ("At the Sorting Hub", Shipment.Status.IN_TRANSIT),
        ("In Transit", Shipment.Status.IN_TRANSIT),
        ("received-at-last-mile-hub", Shipment.Status.IN_TRANSIT),
        ("On Hold", Shipment.Status.IN_TRANSIT),
        ("return-in-transit", Shipment.Status.IN_TRANSIT),
        ("Assigned for Delivery", Shipment.Status.OUT_FOR_DELIVERY),
        ("Delivered", Shipment.Status.DELIVERED),
        ("Partial Delivery", Shipment.Status.DELIVERED),
        ("Paid", Shipment.Status.DELIVERED),
        ("Exchanged", Shipment.Status.DELIVERED),
        ("Returned", Shipment.Status.RETURNED),
        ("Returned to Merchant", Shipment.Status.RETURNED),
        ("paid-return", Shipment.Status.RETURNED),
        ("Delivery Failed", Shipment.Status.FAILED),
        ("Pickup Failed", Shipment.Status.FAILED),
        ("Pickup Cancelled", Shipment.Status.CANCELLED),
    ],
)
def test_every_known_status_maps_to_a_domain_status(provider_status, expected):
    courier = gateway()

    with mock_http(TOKEN, {"data": {"order_status": provider_status}}):
        result = courier.get_tracking_status("X")

    assert result["status"] == expected


def test_unknown_status_stays_unmapped_rather_than_guessing():
    courier = gateway()

    with mock_http(TOKEN, {"data": {"order_status": "Some New State"}}):
        result = courier.get_tracking_status("X")

    assert result["status"] == ""
    assert result["provider_status"] == "Some New State"


def test_status_map_only_produces_domain_statuses():
    assert set(STATUS_MAP.values()) <= set(Shipment.Status.values)


def test_cancel_is_refused_because_the_api_has_no_cancel():
    courier = gateway()

    with pytest.raises(CourierRejectedError) as exc:
        courier.cancel_consignment("DL1")

    assert exc.value.code == "cancel_not_supported"


def test_store_lookup_unwraps_the_paginated_envelope():
    courier = gateway()
    body = {"data": {"data": [{"store_id": 4321, "store_name": "Main"}], "total": 1}}

    with mock_http(TOKEN, body) as mock:
        stores = courier.list_stores()

    assert sent_url(mock, 1).endswith("/aladdin/api/v1/stores")
    assert stores == [{"store_id": 4321, "store_name": "Main"}]


def test_city_zone_area_lookup_paths():
    courier = gateway()
    body = {"data": {"data": []}}

    with mock_http(TOKEN, body) as mock:
        courier.list_cities()
        courier.list_zones(1)
        courier.list_areas(2)

    urls = [sent_url(mock, i) for i in (1, 2, 3)]
    assert urls[0].endswith("/aladdin/api/v1/countries/1/city-list")
    assert urls[1].endswith("/aladdin/api/v1/cities/1/zone-list")
    assert urls[2].endswith("/aladdin/api/v1/zones/2/area-list")
