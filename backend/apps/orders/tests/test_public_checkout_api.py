from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from django.utils import timezone

from apps.catalog.factories import ProductVariantFactory
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.logistics.factories import CarrierFactory, ShippingRateFactory, ShippingZoneFactory
from apps.orders.factories import CouponFactory
from apps.orders.models import Payment, SalesOrder
from apps.orders.services.payment_methods import set_payment_method_enabled

pytestmark = pytest.mark.django_db

GUEST_CHECKOUT_URL = "/api/v1/public/checkout/"
COUPON_VALIDATE_URL = "/api/v1/public/checkout/coupon/"
SHIPPING_QUOTE_URL = "/api/v1/public/checkout/shipping-quote/"
SHIPPING_OPTIONS_URL = "/api/v1/public/checkout/shipping-options/"
SHIPPING_ZONES_URL = "/api/v1/public/checkout/shipping-zones/"


def _stocked_variant(quantity: int = 10, price: Decimal = Decimal("100.00"), weight=None):
    variant = ProductVariantFactory(price=price, weight=weight)
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=quantity,
        unit_cost=Decimal("5.00"),
    )
    return variant


def _configured_delivery(keyword="dhaka", rate=Decimal("60.00")):
    """The root conftest wipes migration-seeded zones for every test, so
    anything that reaches `checkout()` needs its own zone/carrier/rate."""
    zone = ShippingZoneFactory(country_codes=[keyword] if keyword else [])
    carrier = CarrierFactory()
    ShippingRateFactory(
        zone=zone,
        carrier=carrier,
        base_weight=Decimal("50"),
        base_charge=rate,
        increment_weight=Decimal("1"),
        increment_charge=Decimal("0"),
    )
    return zone, carrier


def _guest_payload(variant, **overrides):
    payload = {
        "email": "guest-checkout@example.com",
        "phone": "+8801700000000",
        "first_name": "Guest",
        "last_name": "Customer",
        "items": [{"variant_id": str(variant.id), "quantity": 1}],
        "shipping_address": {
            "full_name": "Guest Customer",
            "phone": "+8801700000000",
            "line1": "House 1, Road 1, Dhaka",
            "postal_code": "1200",
        },
        "payment_method": "cod",
    }
    payload.update(overrides)
    return payload


def test_guest_checkout_requires_payment_method(api_client):
    variant = _stocked_variant()

    payload = _guest_payload(variant)
    del payload["payment_method"]
    response = api_client.post(GUEST_CHECKOUT_URL, payload, format="json")

    assert response.status_code == 400


def test_guest_checkout_with_cod_confirms_the_order_immediately(api_client):
    variant = _stocked_variant()
    _configured_delivery()

    response = api_client.post(GUEST_CHECKOUT_URL, _guest_payload(variant), format="json")

    assert response.status_code == 201
    assert response.data["data"]["status"] == SalesOrder.Status.CONFIRMED
    order = SalesOrder.objects.get(id=response.data["data"]["id"])
    payment = Payment.objects.get(order=order)
    assert payment.method == "cod"
    assert payment.status == Payment.Status.CAPTURED


def test_guest_checkout_rejects_a_disabled_payment_method(api_client):
    variant = _stocked_variant()
    _configured_delivery()
    set_payment_method_enabled(key="cod", is_enabled=False)

    response = api_client.post(GUEST_CHECKOUT_URL, _guest_payload(variant), format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "payment_method_disabled"


def test_guest_checkout_with_invalid_coupon_still_confirms_without_a_discount(api_client):
    variant = _stocked_variant()
    _configured_delivery()

    response = api_client.post(
        GUEST_CHECKOUT_URL,
        _guest_payload(variant, coupon_code="DOES-NOT-EXIST"),
        format="json",
    )

    assert response.status_code == 201
    assert response.data["data"]["status"] == SalesOrder.Status.CONFIRMED
    assert response.data["data"]["coupon_code"] is None
    assert Decimal(response.data["data"]["discount_total"]) == Decimal("0.00")


def test_guest_checkout_applies_a_valid_coupon(api_client):
    variant = _stocked_variant(price=Decimal("100.00"))
    _configured_delivery()
    CouponFactory(code="GUEST10", value=Decimal("10"))

    response = api_client.post(
        GUEST_CHECKOUT_URL,
        _guest_payload(variant, coupon_code="guest10"),
        format="json",
    )

    assert response.status_code == 201
    assert response.data["data"]["coupon_code"] == "GUEST10"
    assert Decimal(response.data["data"]["discount_total"]) == Decimal("10.00")


def test_coupon_validate_returns_discount_for_a_valid_code(api_client):
    variant = _stocked_variant(price=Decimal("50.00"))
    CouponFactory(code="SAVE20", discount_type="fixed", value=Decimal("20.00"))

    response = api_client.post(
        COUPON_VALIDATE_URL,
        {"code": "save20", "items": [{"variant_id": str(variant.id), "quantity": 1}]},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["data"]["code"] == "SAVE20"
    assert response.data["data"]["discount_amount"] == "20.00"
    assert response.data["data"]["subtotal"] == "50.00"


def test_coupon_validate_rejects_unknown_code(api_client):
    variant = _stocked_variant()

    response = api_client.post(
        COUPON_VALIDATE_URL,
        {"code": "NOPE", "items": [{"variant_id": str(variant.id), "quantity": 1}]},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "invalid_coupon"


def test_coupon_validate_rejects_expired_code(api_client):
    variant = _stocked_variant()
    CouponFactory(code="OLD10", expires_at=timezone.now() - timedelta(days=1))

    response = api_client.post(
        COUPON_VALIDATE_URL,
        {"code": "OLD10", "items": [{"variant_id": str(variant.id), "quantity": 1}]},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "coupon_expired"


def test_coupon_validate_unknown_variant_returns_404_style_error(api_client):
    response = api_client.post(
        COUPON_VALIDATE_URL,
        {"code": "ANY", "items": [{"variant_id": str(uuid4()), "quantity": 1}]},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "variant_not_found"


def test_public_shipping_quote_with_address_text(api_client):
    variant = _stocked_variant(weight=Decimal("2.000"))
    zone = ShippingZoneFactory(country_codes=["dhaka"])
    carrier = CarrierFactory()
    ShippingRateFactory(
        zone=zone,
        carrier=carrier,
        base_weight=Decimal("50"),
        base_charge=Decimal("60.00"),
        increment_weight=Decimal("1"),
        increment_charge=Decimal("0"),
    )

    response = api_client.post(
        SHIPPING_QUOTE_URL,
        {
            "items": [{"variant_id": str(variant.id), "quantity": 1}],
            "address_text": "Dhaka",
            "carrier_id": str(carrier.id),
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["data"]["shipping_total"] == "60.00"


def test_public_shipping_quote_requires_address_text_or_zone_id(api_client):
    variant = _stocked_variant()

    response = api_client.post(
        SHIPPING_QUOTE_URL,
        {"items": [{"variant_id": str(variant.id), "quantity": 1}]},
        format="json",
    )

    assert response.status_code == 400


def test_public_shipping_quote_unknown_variant_errors(api_client):
    _configured_delivery()

    response = api_client.post(
        SHIPPING_QUOTE_URL,
        {"items": [{"variant_id": str(uuid4()), "quantity": 1}], "address_text": "Dhaka"},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "variant_not_found"


def test_public_shipping_options_never_leaks_carrier_secrets(api_client):
    variant = _stocked_variant(weight=Decimal("1.000"))
    zone = ShippingZoneFactory(country_codes=["dhaka"])
    carrier = CarrierFactory(api_key="secret-key", api_secret="secret-value")
    ShippingRateFactory(zone=zone, carrier=carrier, base_weight=Decimal("50"), base_charge=Decimal("15.00"))

    response = api_client.post(
        SHIPPING_OPTIONS_URL,
        {"items": [{"variant_id": str(variant.id), "quantity": 1}], "address_text": "Dhaka"},
        format="json",
    )

    assert response.status_code == 200
    option = response.data["data"]["options"][0]
    assert set(option) == {"id", "name", "cost"}


def test_public_shipping_zones_lists_active_zones_without_leaking_keywords(api_client):
    inside = ShippingZoneFactory(name="Inside Dhaka", country_codes=["dhaka", "gulshan"])
    outside = ShippingZoneFactory(name="Outside Dhaka", country_codes=[])

    response = api_client.get(SHIPPING_ZONES_URL)

    assert response.status_code == 200
    zones = response.data["data"]
    assert {z["id"] for z in zones} >= {str(inside.id), str(outside.id)}
    for zone in zones:
        assert set(zone) == {"id", "name"}
