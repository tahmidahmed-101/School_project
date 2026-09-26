from __future__ import annotations

from decimal import Decimal

import pytest

from apps.logistics.models import Carrier
from apps.logistics.services.couriers.exceptions import (
    CourierAuthError,
    CourierNotConfiguredError,
    CourierRateLimitedError,
    CourierRejectedError,
    CourierUnavailableError,
)
from apps.logistics.services.couriers.redx import (
    PRODUCTION_BASE_URL,
    SANDBOX_BASE_URL,
    STATUS_MAP,
    RedXGateway,
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

CONFIG = {"delivery_area_id": 1, "delivery_area": "Banani", "pickup_store_id": 77}

CREATED = {"tracking_id": "20A312THJDJ8"}


def gateway(config=None, **overrides) -> RedXGateway:
    carrier = make_carrier(Carrier.Provider.REDX, config={**CONFIG, **(config or {})}, **overrides)
    return get_gateway_for_carrier(carrier)


def test_registry_returns_redx_gateway():
    assert isinstance(gateway(), RedXGateway)


def test_create_parcel_posts_documented_payload():
    courier = gateway()
    shipment = make_shipment(courier.carrier, weight=Decimal("1.25"), quantity=2)

    with mock_http(CREATED) as mock:
        result = courier.create_consignment(shipment)

    assert sent_url(mock) == f"{PRODUCTION_BASE_URL}/parcel"
    payload = sent_payload(mock)
    assert payload["customer_name"] == "Rahim Uddin"
    assert payload["customer_phone"] == "01711111111"
    assert payload["customer_address"] == "House 17/1, Road 3/A, Dhanmondi, Dhaka, 1209"
    assert payload["delivery_area"] == "Banani"
    assert payload["delivery_area_id"] == 1
    assert payload["merchant_invoice_id"] == shipment.order.order_number
    assert payload["cash_collection_amount"] == "1250.00"
    assert payload["parcel_weight"] == 2500
    assert payload["value"] == "2000.00"
    assert payload["pickup_store_id"] == "77"
    assert result["consignment_id"] == "20A312THJDJ8"
    assert result["status"] == Shipment.Status.SHIPPED


def test_parcel_weight_is_sent_in_grams():
    courier = gateway()
    shipment = make_shipment(courier.carrier, weight=Decimal("0.4"), quantity=1)

    with mock_http(CREATED) as mock:
        courier.create_consignment(shipment)

    assert sent_payload(mock)["parcel_weight"] == 400


def test_weightless_parcel_uses_the_configured_default_grams():
    courier = gateway({"default_parcel_weight_grams": 750})
    shipment = make_shipment(courier.carrier)

    with mock_http(CREATED) as mock:
        courier.create_consignment(shipment)

    assert sent_payload(mock)["parcel_weight"] == 750


def test_parcel_details_json_is_a_list_of_items():
    courier = gateway({"parcel_category": "fashion"})
    shipment = make_shipment(courier.carrier)

    with mock_http(CREATED) as mock:
        courier.create_consignment(shipment)

    details = sent_payload(mock)["parcel_details_json"]
    assert isinstance(details, list)
    assert details[0]["category"] == "fashion"
    assert details[0]["value"] == 2000


def test_auth_header_is_the_redx_specific_token_header():
    courier = gateway(api_key="jwt-token")
    shipment = make_shipment(courier.carrier)

    with mock_http(CREATED) as mock:
        courier.create_consignment(shipment)

    headers = sent_headers(mock)
    assert headers["Api-access-token"] == "Bearer jwt-token"
    assert "Authorization" not in headers


def test_sandbox_flag_selects_the_sandbox_host():
    courier = gateway({"sandbox": True})
    shipment = make_shipment(courier.carrier)

    with mock_http(CREATED) as mock:
        courier.create_consignment(shipment)

    assert sent_url(mock).startswith(SANDBOX_BASE_URL)


def test_area_id_can_be_resolved_per_city():
    courier = gateway({"delivery_area_id": None, "area_id_by_city": {"Dhaka": 42}})
    shipment = make_shipment(courier.carrier)

    with mock_http(CREATED) as mock:
        courier.create_consignment(shipment)

    payload = sent_payload(mock)
    assert payload["delivery_area_id"] == 42
    assert payload["delivery_area"] == "Dhaka"


def test_unconfigured_area_refuses_to_dispatch():
    courier = gateway({"delivery_area_id": None})
    shipment = make_shipment(courier.carrier)

    with mock_http(CREATED) as mock, pytest.raises(CourierNotConfiguredError):
        courier.create_consignment(shipment)

    assert mock.call_count == 0


def test_unknown_city_with_only_a_city_map_refuses_to_dispatch():
    courier = gateway({"delivery_area_id": None, "area_id_by_city": {"Khulna": 9}})
    shipment = make_shipment(courier.carrier)

    with mock_http(CREATED) as mock, pytest.raises(CourierNotConfiguredError):
        courier.create_consignment(shipment)

    assert mock.call_count == 0


def test_disabled_integration_refuses_to_dispatch():
    courier = gateway(is_integration_enabled=False)
    shipment = make_shipment(courier.carrier)

    with pytest.raises(CourierNotConfiguredError):
        courier.create_consignment(shipment)


def test_missing_tracking_id_is_rejected():
    courier = gateway()
    shipment = make_shipment(courier.carrier)

    with mock_http({}), pytest.raises(CourierRejectedError):
        courier.create_consignment(shipment)


def test_unauthorized_raises_auth_error():
    courier = gateway()
    shipment = make_shipment(courier.carrier)
    error = http_error(401, {"message": "Unauthorized", "status_code": 401})

    with mock_http(error), pytest.raises(CourierAuthError):
        courier.create_consignment(shipment)


def test_rate_limit_raises_rate_limited():
    courier = gateway()
    shipment = make_shipment(courier.carrier)

    with mock_http(http_error(429, {})), pytest.raises(CourierRateLimitedError):
        courier.create_consignment(shipment)


def test_bad_request_raises_rejected():
    courier = gateway()
    shipment = make_shipment(courier.carrier)

    with mock_http(http_error(400, {"message": "bad area"})), pytest.raises(CourierRejectedError):
        courier.create_consignment(shipment)


def test_network_failure_raises_unavailable():
    courier = gateway()
    shipment = make_shipment(courier.carrier)

    with mock_http(TimeoutError("timed out")), pytest.raises(CourierUnavailableError):
        courier.create_consignment(shipment)


def test_get_tracking_status_reads_parcel_info_not_track():
    courier = gateway()
    body = {"parcel": {"tracking_id": "20A312THJDJ8", "status": "delivered"}}

    with mock_http(body) as mock:
        result = courier.get_tracking_status("20A312THJDJ8")

    assert sent_url(mock) == f"{PRODUCTION_BASE_URL}/parcel/info/20A312THJDJ8"
    assert result["status"] == Shipment.Status.DELIVERED


@pytest.mark.parametrize(
    ("provider_status", "expected"),
    [
        ("pickup-pending", Shipment.Status.SHIPPED),
        ("ready-for-delivery", Shipment.Status.IN_TRANSIT),
        ("agent-hold", Shipment.Status.IN_TRANSIT),
        ("agent-area-change", Shipment.Status.IN_TRANSIT),
        ("agent-returning", Shipment.Status.IN_TRANSIT),
        ("delivery-in-progress", Shipment.Status.OUT_FOR_DELIVERY),
        ("delivered", Shipment.Status.DELIVERED),
        ("paid", Shipment.Status.DELIVERED),
        ("returned", Shipment.Status.RETURNED),
        ("cancelled", Shipment.Status.CANCELLED),
    ],
)
def test_every_known_status_maps_to_a_domain_status(provider_status, expected):
    courier = gateway()

    with mock_http({"parcel": {"status": provider_status}}):
        result = courier.get_tracking_status("X")

    assert result["status"] == expected


def test_undocumented_status_stays_unmapped():
    courier = gateway()

    with mock_http({"parcel": {"status": "some-new-state"}}):
        result = courier.get_tracking_status("X")

    assert result["status"] == ""
    assert result["provider_status"] == "some-new-state"


def test_status_map_only_produces_domain_statuses():
    assert set(STATUS_MAP.values()) <= set(Shipment.Status.values)


def test_cancel_patches_the_parcels_collection():
    courier = gateway({"cancel_reason": "Customer changed mind"})

    with mock_http({"success": True, "message": "Request Accepted"}) as mock:
        assert courier.cancel_consignment("20A312THJDJ8") is True

    assert sent_url(mock) == f"{PRODUCTION_BASE_URL}/parcels"
    assert sent_payload(mock) == {
        "entity_type": "parcel-tracking-id",
        "entity_id": "20A312THJDJ8",
        "update_details": {
            "property_name": "status",
            "new_value": "cancelled",
            "reason": "Customer changed mind",
        },
    }


def test_list_areas_unwraps_and_passes_filters():
    courier = gateway()
    body = {"areas": [{"id": 1, "name": "Banani"}]}

    with mock_http(body) as mock:
        areas = courier.list_areas(post_code=1213)

    assert sent_url(mock) == f"{PRODUCTION_BASE_URL}/areas?post_code=1213"
    assert areas == [{"id": 1, "name": "Banani"}]


def test_list_pickup_stores_unwraps_the_envelope():
    courier = gateway()

    with mock_http({"pickup_stores": [{"id": 77}]}) as mock:
        stores = courier.list_pickup_stores()

    assert sent_url(mock) == f"{PRODUCTION_BASE_URL}/pickup/stores"
    assert stores == [{"id": 77}]
