from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductVariantFactory
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.logistics.factories import CarrierFactory, ShippingRateFactory, ShippingZoneFactory
from apps.logistics.models import ShippingRate
from apps.logistics.selectors.rates import find_zone_by_address_text
from apps.logistics.services.rates import create_rate, create_zone, quote_shipping
from apps.orders.models import SalesOrder

pytestmark = pytest.mark.django_db

ZONES_URL = "/api/v1/admin/logistics/zones/"
RATES_URL = "/api/v1/admin/logistics/rates/"
QUOTE_URL = "/api/v1/public/checkout/shipping-quote/"
OPTIONS_URL = "/api/v1/public/checkout/shipping-options/"
PUBLIC_ZONES_URL = "/api/v1/public/checkout/shipping-zones/"
CHECKOUT_URL = "/api/v1/public/checkout/"


def _delivery(kind: str, charge: str, carrier=None, name: str = "Dhaka"):
    zone = ShippingZoneFactory(name=name, kind=kind, country_codes=["dhaka"])
    rate = ShippingRateFactory(
        zone=zone,
        carrier=carrier or CarrierFactory(),
        base_weight=Decimal("50"),
        base_charge=Decimal(charge),
        increment_weight=Decimal("1"),
        increment_charge=Decimal("0"),
    )
    return zone, rate


def _stock_variant():
    variant = ProductVariantFactory(price=Decimal("100.00"))
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("5.00"),
    )
    return variant


def _preorder_variant():
    now = timezone.now()
    return ProductVariantFactory(
        price=Decimal("100.00"),
        product__category__category_type="preorder",
        is_preorder_enabled=True,
        preorder_start_date=now - timedelta(days=1),
        preorder_end_date=now + timedelta(days=1),
    )


def _items(variant) -> list[dict]:
    return [{"variant_id": str(variant.id), "quantity": 1}]


def _checkout_payload(variant) -> dict:
    return {
        "phone": "+8801700000000",
        "first_name": "Guest",
        "last_name": "Customer",
        "items": _items(variant),
        "shipping_address": {
            "full_name": "Guest Customer",
            "phone": "+8801700000000",
            "line1": "House 1, Road 1, Dhaka",
            "city": "Dhaka",
        },
        "payment_method": "cod",
    }


def _admin(api_client):
    api_client.force_authenticate(
        user=create_user(email="delivery-kind-admin@example.com", role=UserRole.ADMIN)
    )
    return api_client


def test_an_address_matches_only_a_zone_of_the_asked_kind():
    stock_zone, _ = _delivery("stock", "60.00")

    assert find_zone_by_address_text("Road 1, Dhaka", kind="stock") == stock_zone
    assert find_zone_by_address_text("Road 1, Dhaka", kind="preorder") is None


def test_a_quote_never_falls_back_to_the_other_kinds_rate():
    stock_zone, rate = _delivery("stock", "60.00")

    assert quote_shipping(zone=stock_zone, weight=Decimal("1"), kind="stock") == Decimal("60.00")
    with pytest.raises(BusinessRuleViolationError) as exc:
        quote_shipping(zone=stock_zone, weight=Decimal("1"), kind="preorder")
    assert exc.value.code == "no_shipping_rate"
    assert rate.kind == "stock"


def test_each_half_keeps_its_own_zone_of_the_same_name():
    create_zone(name="Dhaka", kind="stock")
    create_zone(name="Dhaka", kind="preorder")

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_zone(name="Dhaka", kind="preorder")
    assert exc.value.code == "zone_exists"


def test_a_rate_takes_its_zones_kind_and_refuses_the_other():
    zone = create_zone(name="Dhaka", kind="preorder")
    carrier = CarrierFactory()
    fields = {
        "base_weight": Decimal("1"),
        "base_charge": Decimal("80.00"),
        "increment_weight": Decimal("1"),
        "increment_charge": Decimal("10.00"),
    }

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_rate(zone=zone, carrier=carrier, kind="stock", **fields)
    assert exc.value.code == "rate_kind_mismatch"

    assert create_rate(zone=zone, carrier=carrier, **fields).kind == "preorder"


def test_admin_zone_and_rate_lists_show_one_half(api_client):
    client = _admin(api_client)
    carrier = CarrierFactory()
    stock_zone, stock_rate = _delivery("stock", "60.00", carrier)
    preorder_zone, preorder_rate = _delivery("preorder", "90.00", carrier)

    zones = client.get(ZONES_URL, {"kind": "preorder"}).data["data"]["results"]
    assert [(row["id"], row["kind"]) for row in zones] == [(str(preorder_zone.id), "preorder")]
    assert [rate["id"] for rate in zones[0]["rates"]] == [str(preorder_rate.id)]

    rates = client.get(RATES_URL, {"kind": "stock"}).data["data"]["results"]
    assert [(row["id"], row["kind"]) for row in rates] == [(str(stock_rate.id), "stock")]

    assert client.get(ZONES_URL, {"kind": "both"}).status_code == 400
    assert client.get(RATES_URL, {"kind": "both"}).status_code == 400
    assert stock_zone.kind == "stock"


def test_admin_creates_a_zone_and_a_rate_in_the_asked_half(api_client):
    client = _admin(api_client)
    carrier = CarrierFactory()

    created = client.post(ZONES_URL, {"name": "Dhaka", "kind": "preorder"}, format="json")
    assert created.status_code == 201, created.data
    assert created.data["data"]["kind"] == "preorder"
    zone_id = created.data["data"]["id"]

    rate = {
        "carrier_id": str(carrier.id),
        "base_weight": "1",
        "base_charge": "80.00",
        "increment_weight": "1",
        "increment_charge": "10.00",
    }
    wrong = client.post(f"{ZONES_URL}{zone_id}/rates/", {**rate, "kind": "stock"}, format="json")
    assert wrong.status_code == 409
    assert wrong.data["error"]["code"] == "rate_kind_mismatch"

    made = client.post(f"{ZONES_URL}{zone_id}/rates/", {**rate, "kind": "preorder"}, format="json")
    assert made.status_code == 201, made.data
    assert ShippingRate.objects.get(zone_id=zone_id).kind == "preorder"

    again = client.post(ZONES_URL, {"name": "Dhaka", "kind": "preorder"}, format="json")
    assert again.status_code == 409
    assert again.data["error"]["code"] == "zone_exists"
    assert client.post(ZONES_URL, {"name": "Dhaka"}, format="json").data["data"]["kind"] == "stock"


def test_public_quote_reads_the_kind_from_the_basket(api_client):
    carrier = CarrierFactory()
    _delivery("stock", "60.00", carrier)
    preorder = _preorder_variant()
    body = {"items": _items(preorder), "address_text": "Road 1, Dhaka", "kind": "stock"}

    missing = api_client.post(QUOTE_URL, body, format="json")
    assert missing.status_code == 400
    assert missing.data["error"]["code"] == "zone_not_found"

    _delivery("preorder", "90.00", carrier)
    quote = api_client.post(QUOTE_URL, body, format="json")
    assert quote.data["data"]["shipping_total"] == "90.00"

    stock_body = {"items": _items(_stock_variant()), "address_text": "Road 1, Dhaka"}
    assert (
        api_client.post(QUOTE_URL, stock_body, format="json").data["data"]["shipping_total"]
        == "60.00"
    )
    options = api_client.post(OPTIONS_URL, body, format="json").data["data"]["options"]
    assert {option["cost"] for option in options} == {"90.00", None}


def test_public_quote_refuses_a_zone_of_the_other_kind_and_a_mixed_basket(api_client):
    stock_zone, _ = _delivery("stock", "60.00")
    preorder = _preorder_variant()

    other = api_client.post(
        QUOTE_URL, {"items": _items(preorder), "zone_id": str(stock_zone.id)}, format="json"
    )
    assert other.status_code == 404
    assert other.data["error"]["code"] == "zone_not_found"

    mixed = api_client.post(
        QUOTE_URL,
        {"items": _items(preorder) + _items(_stock_variant()), "address_text": "Dhaka"},
        format="json",
    )
    assert mixed.status_code == 400
    assert mixed.data["error"]["code"] == "mixed_basket"


def test_public_zone_list_shows_one_half(api_client):
    stock_zone, _ = _delivery("stock", "60.00")
    preorder_zone, _ = _delivery("preorder", "90.00")

    default = api_client.get(PUBLIC_ZONES_URL).data["data"]
    preorder = api_client.get(PUBLIC_ZONES_URL, {"kind": "preorder"}).data["data"]

    assert [row["id"] for row in default] == [str(stock_zone.id)]
    assert [row["id"] for row in preorder] == [str(preorder_zone.id)]
    assert api_client.get(PUBLIC_ZONES_URL, {"kind": "both"}).status_code == 400


def test_preorder_checkout_is_refused_until_the_preorder_half_has_delivery_set_up(api_client):
    carrier = CarrierFactory()
    _delivery("stock", "60.00", carrier)
    variant = _preorder_variant()

    refused = api_client.post(CHECKOUT_URL, _checkout_payload(variant), format="json")
    assert refused.status_code == 400
    assert refused.data["error"]["code"] == "no_shipping_zone"
    assert not SalesOrder.objects.exclude(status=SalesOrder.Status.PENDING).exists()

    _delivery("preorder", "90.00", carrier)
    placed = api_client.post(CHECKOUT_URL, _checkout_payload(variant), format="json")
    assert placed.status_code == 201, placed.data
    order = SalesOrder.objects.get(order_type=SalesOrder.OrderType.PREORDER)
    assert order.shipping_total == Decimal("90.00")


def test_stock_checkout_still_pays_the_stock_rate(api_client):
    carrier = CarrierFactory()
    _delivery("stock", "60.00", carrier)
    _delivery("preorder", "90.00", carrier)

    placed = api_client.post(CHECKOUT_URL, _checkout_payload(_stock_variant()), format="json")

    assert placed.status_code == 201, placed.data
    assert SalesOrder.objects.get().shipping_total == Decimal("60.00")
