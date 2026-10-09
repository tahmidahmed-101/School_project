from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.catalog.factories import ProductVariantFactory
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.logistics.factories import CarrierFactory, ShippingRateFactory, ShippingZoneFactory
from apps.orders.models import PaymentMethodSetting, SalesOrder
from apps.orders.selectors.payment_methods import is_payment_method_enabled, payment_methods_list
from apps.orders.services.payment_methods import (
    set_payment_method_enabled,
    set_payment_method_pay_to,
)

pytestmark = pytest.mark.django_db

ADMIN_URL = "/api/v1/admin/settings/payment-methods/"
PUBLIC_URL = "/api/v1/public/payment-methods/"
CHECKOUT_URL = "/api/v1/public/checkout/"


def _delivery_for_both_halves() -> None:
    carrier = CarrierFactory()
    for kind in ("stock", "preorder"):
        ShippingRateFactory(
            zone=ShippingZoneFactory(name="Dhaka", kind=kind, country_codes=["dhaka"]),
            carrier=carrier,
            base_weight=Decimal("50"),
            base_charge=Decimal("60.00"),
            increment_weight=Decimal("1"),
            increment_charge=Decimal("0"),
        )


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


def _payload(variant, method: str = "cod") -> dict:
    return {
        "phone": "+8801700000000",
        "first_name": "Guest",
        "last_name": "Customer",
        "items": [{"variant_id": str(variant.id), "quantity": 1}],
        "shipping_address": {
            "full_name": "Guest Customer",
            "phone": "+8801700000000",
            "line1": "House 1, Road 1, Dhaka",
            "city": "Dhaka",
        },
        "payment_method": method,
    }


def test_switching_a_method_off_for_one_half_leaves_the_other_on():
    set_payment_method_enabled(key="cod", is_enabled=False, kind="preorder")

    assert is_payment_method_enabled("cod", kind="preorder") is False
    assert is_payment_method_enabled("cod", kind="stock") is True
    assert PaymentMethodSetting.objects.filter(key="cod").count() == 1


def test_each_half_keeps_its_own_pay_to_number():
    set_payment_method_pay_to(key="bkash", pay_to="stock-number", kind="stock")
    set_payment_method_pay_to(key="bkash", pay_to="preorder-number", kind="preorder")

    def pay_to(kind: str) -> str:
        return next(r["pay_to"] for r in payment_methods_list(kind=kind) if r["key"] == "bkash")

    assert pay_to("stock") == "stock-number"
    assert pay_to("preorder") == "preorder-number"


def test_public_list_returns_the_asked_halfs_methods(api_client):
    set_payment_method_enabled(key="cod", is_enabled=False, kind="preorder")
    set_payment_method_pay_to(key="bkash", pay_to="preorder-number", kind="preorder")

    default = api_client.get(PUBLIC_URL).data["data"]
    preorder = api_client.get(PUBLIC_URL, {"kind": "preorder"}).data["data"]

    assert {row["key"] for row in default} == {"cod", "bkash", "nagad"}
    assert {row["kind"] for row in default} == {"stock"}
    assert {row["key"] for row in preorder} == {"bkash", "nagad"}
    assert next(r["pay_to"] for r in preorder if r["key"] == "bkash") == "preorder-number"
    assert next(r["pay_to"] for r in default if r["key"] == "bkash") == ""
    assert api_client.get(PUBLIC_URL, {"kind": "both"}).status_code == 400


def test_admin_reads_and_writes_one_half(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    changed = api_client.patch(
        f"{ADMIN_URL}nagad/?kind=preorder",
        {"is_enabled": False, "pay_to": "01800000000"},
        format="json",
    )

    assert changed.status_code == 200, changed.data
    assert changed.data["data"]["kind"] == "preorder"

    def row(params: dict) -> dict:
        rows = api_client.get(ADMIN_URL, params).data["data"]
        return next(r for r in rows if r["key"] == "nagad")

    assert row({"kind": "preorder"})["is_enabled"] is False
    assert row({"kind": "preorder"})["pay_to"] == "01800000000"
    assert row({})["is_enabled"] is True
    assert row({})["pay_to"] == ""
    assert api_client.get(ADMIN_URL, {"kind": "both"}).status_code == 400
    assert api_client.patch(f"{ADMIN_URL}nagad/?kind=both", {}, format="json").status_code == 400


def test_checkout_checks_the_method_against_the_orders_own_half(api_client):
    _delivery_for_both_halves()
    set_payment_method_enabled(key="cod", is_enabled=False, kind="preorder")

    refused = api_client.post(CHECKOUT_URL, _payload(_preorder_variant()), format="json")
    assert refused.status_code == 400
    assert refused.data["error"]["code"] == "payment_method_disabled"

    placed = api_client.post(CHECKOUT_URL, _payload(_stock_variant()), format="json")
    assert placed.status_code == 201, placed.data

    by_bkash = api_client.post(CHECKOUT_URL, _payload(_preorder_variant(), "bkash"), format="json")
    assert by_bkash.status_code == 201, by_bkash.data
    assert SalesOrder.objects.filter(order_type=SalesOrder.OrderType.PREORDER).exists()


def test_a_client_sent_kind_cannot_unlock_a_method_at_checkout(api_client):
    _delivery_for_both_halves()
    set_payment_method_enabled(key="cod", is_enabled=False, kind="preorder")

    response = api_client.post(
        f"{CHECKOUT_URL}?kind=stock",
        {**_payload(_preorder_variant()), "kind": "stock"},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "payment_method_disabled"
