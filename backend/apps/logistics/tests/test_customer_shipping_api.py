from __future__ import annotations

import json
from decimal import Decimal
from uuid import uuid4

import pytest
from django.utils import timezone

from apps.accounts.factories import AddressFactory, CustomerUserFactory
from apps.catalog.factories import ProductVariantFactory
from apps.logistics.factories import CarrierFactory, ShippingRateFactory, ShippingZoneFactory
from apps.logistics.models import ShippingZone
from apps.orders.services.carts import add_line, get_or_create_cart

pytestmark = pytest.mark.django_db

SECRET_KEYS = ("api_key", "api_secret", "webhook_secret")


def _cart_with_weight(user, weight: Decimal):
    cart = get_or_create_cart(user)
    variant = ProductVariantFactory(weight=weight)
    add_line(order=cart, variant=variant, quantity=1)
    return cart


def _configured_carrier(keyword="dhaka", rate=Decimal("7.50")):
    zone = ShippingZoneFactory(country_codes=[keyword] if keyword else [])
    carrier = CarrierFactory(
        api_key="ak-super-secret",
        api_secret="as-super-secret",
        webhook_secret="ws-super-secret",
    )
    ShippingRateFactory(
        zone=zone,
        carrier=carrier,
        base_weight=Decimal("50"),
        base_charge=rate,
        increment_weight=Decimal("1"),
        increment_charge=Decimal("0"),
    )
    return carrier


def test_shipping_quote_with_address(api_client):
    user = CustomerUserFactory()
    api_client.force_authenticate(user=user)
    address = AddressFactory(user=user, city="Dhaka")
    _configured_carrier()
    _cart_with_weight(user, Decimal("2.000"))

    response = api_client.post(
        "/api/v1/customer/orders/cart/shipping-quote/",
        {"address_id": str(address.id)},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["data"]["shipping_total"] == "7.50"
    assert response.data["message"] == "Success"


def test_shipping_quote_with_raw_address_text_and_carrier(api_client):
    user = CustomerUserFactory()
    api_client.force_authenticate(user=user)
    carrier = _configured_carrier(keyword="dhaka", rate=Decimal("11.00"))
    _cart_with_weight(user, Decimal("1.000"))

    response = api_client.post(
        "/api/v1/customer/orders/cart/shipping-quote/",
        {"address_text": "Dhaka", "carrier_id": str(carrier.id)},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["data"]["shipping_total"] == "11.00"


def test_shipping_quote_with_zone_id_skips_address_matching(api_client):
    """An explicit zone_id must win outright — no address/text needed at all,
    and no keyword matching involved."""
    user = CustomerUserFactory()
    api_client.force_authenticate(user=user)
    zone = ShippingZoneFactory(name="Inside Dhaka", country_codes=["some-other-keyword"])
    carrier = CarrierFactory()
    ShippingRateFactory(
        zone=zone, carrier=carrier, base_weight=Decimal("50"), base_charge=Decimal("80.00")
    )
    _cart_with_weight(user, Decimal("1.000"))

    response = api_client.post(
        "/api/v1/customer/orders/cart/shipping-quote/",
        {"zone_id": str(zone.id), "carrier_id": str(carrier.id)},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["data"]["zone"] == "Inside Dhaka"
    assert response.data["data"]["shipping_total"] == "80.00"


def test_shipping_quote_unknown_zone_id_returns_404(api_client):
    user = CustomerUserFactory()
    api_client.force_authenticate(user=user)

    response = api_client.post(
        "/api/v1/customer/orders/cart/shipping-quote/",
        {"zone_id": str(uuid4())},
        format="json",
    )

    assert response.status_code == 404
    assert response.data["error"]["code"] == "zone_not_found"


def test_shipping_quote_requires_address_or_address_text(api_client):
    user = CustomerUserFactory()
    api_client.force_authenticate(user=user)

    response = api_client.post("/api/v1/customer/orders/cart/shipping-quote/", {}, format="json")

    assert response.status_code == 400


def test_shipping_quote_treats_another_customers_address_as_404(api_client):
    user = CustomerUserFactory()
    other_address = AddressFactory(user=CustomerUserFactory(), city="Dhaka")
    api_client.force_authenticate(user=user)

    response = api_client.post(
        "/api/v1/customer/orders/cart/shipping-quote/",
        {"address_id": str(other_address.id)},
        format="json",
    )

    assert response.status_code == 404
    assert response.data["error"]["code"] == "address_not_found"


def test_shipping_quote_unmatched_address_returns_error_without_a_fallback_zone(api_client):
    # No zones at all — not the real-world case (migration 0009 always leaves a
    # fallback), but the code must still refuse cleanly rather than 500.
    ShippingZone.objects.update(deleted_at=timezone.now())
    user = CustomerUserFactory()
    api_client.force_authenticate(user=user)

    response = api_client.post(
        "/api/v1/customer/orders/cart/shipping-quote/",
        {"address_text": "Nowhereville"},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "zone_not_found"


def test_shipping_quote_unmatched_address_falls_back_to_the_no_keyword_zone(api_client):
    """A zone with no keywords is the catch-all — what "Outside Dhaka" is in prod."""
    user = CustomerUserFactory()
    api_client.force_authenticate(user=user)
    outside = ShippingZoneFactory(name="Outside Dhaka", country_codes=[])
    carrier = CarrierFactory()
    ShippingRateFactory(
        zone=outside, carrier=carrier, base_weight=Decimal("50"), base_charge=Decimal("20.00")
    )
    _cart_with_weight(user, Decimal("1.000"))

    response = api_client.post(
        "/api/v1/customer/orders/cart/shipping-quote/",
        {"address_text": "Nowhereville", "carrier_id": str(carrier.id)},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["data"]["shipping_total"] == "20.00"


def test_shipping_quote_unknown_carrier_returns_404(api_client):
    user = CustomerUserFactory()
    api_client.force_authenticate(user=user)
    ShippingZoneFactory(country_codes=["dhaka"])

    response = api_client.post(
        "/api/v1/customer/orders/cart/shipping-quote/",
        {"address_text": "Dhaka", "carrier_id": str(uuid4())},
        format="json",
    )

    assert response.status_code == 404
    assert response.data["error"]["code"] == "carrier_not_found"


def test_shipping_quote_denied_for_anonymous(api_client):
    response = api_client.post(
        "/api/v1/customer/orders/cart/shipping-quote/", {"address_text": "Dhaka"}, format="json"
    )

    assert response.status_code in (401, 403)


def test_shipping_options_returns_quoted_carriers(api_client):
    user = CustomerUserFactory()
    api_client.force_authenticate(user=user)
    carrier = _configured_carrier(keyword="dhaka", rate=Decimal("6.25"))
    _cart_with_weight(user, Decimal("3.000"))

    response = api_client.get("/api/v1/customer/orders/cart/shipping-options/?address_text=Dhaka")

    assert response.status_code == 200
    options = response.data["data"]["options"]
    our_option = next(o for o in options if o["id"] == str(carrier.id))
    assert our_option["cost"] == "6.25"


def test_shipping_options_never_leaks_carrier_secrets(api_client):
    user = CustomerUserFactory()
    api_client.force_authenticate(user=user)
    _configured_carrier()
    _cart_with_weight(user, Decimal("1.000"))

    response = api_client.get("/api/v1/customer/orders/cart/shipping-options/?address_text=Dhaka")

    assert response.status_code == 200
    option = response.data["data"]["options"][0]
    assert set(option) == {"id", "name", "cost"}
    body = json.dumps(response.data)
    for key in SECRET_KEYS:
        assert key not in body
    for secret in ("ak-super-secret", "as-super-secret", "ws-super-secret"):
        assert secret not in body


def test_shipping_options_requires_address_text(api_client):
    user = CustomerUserFactory()
    api_client.force_authenticate(user=user)

    response = api_client.get("/api/v1/customer/orders/cart/shipping-options/")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "missing_address_text"


def test_shipping_options_denied_for_staff_user(api_client, staff_user):
    api_client.force_authenticate(user=staff_user)

    response = api_client.get("/api/v1/customer/orders/cart/shipping-options/?address_text=Dhaka")

    assert response.status_code == 403


def test_shipping_zones_lists_active_zones_without_leaking_keywords(api_client):
    user = CustomerUserFactory()
    api_client.force_authenticate(user=user)
    inside = ShippingZoneFactory(name="Inside Dhaka", country_codes=["dhaka", "gulshan"])
    outside = ShippingZoneFactory(name="Outside Dhaka", country_codes=[])
    ShippingZoneFactory(name="Retired Zone", country_codes=[], deleted_at=timezone.now())

    response = api_client.get("/api/v1/customer/orders/cart/shipping-zones/")

    assert response.status_code == 200
    zones = response.data["data"]
    assert {z["id"] for z in zones} == {str(inside.id), str(outside.id)}
    for zone in zones:
        assert set(zone) == {"id", "name"}
    body = json.dumps(response.data)
    assert "gulshan" not in body


def test_shipping_zones_denied_for_anonymous(api_client):
    response = api_client.get("/api/v1/customer/orders/cart/shipping-zones/")

    assert response.status_code in (401, 403)
