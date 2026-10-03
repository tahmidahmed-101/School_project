from __future__ import annotations

from decimal import Decimal

import pytest

from apps.common.exceptions import BusinessRuleViolationError
from apps.orders.constants import PaymentMethodKey, normalize_payment_method
from apps.orders.models import PaymentMethodSetting
from apps.orders.selectors.payment_methods import (
    is_payment_method_enabled,
    payment_methods_list,
)
from apps.orders.services.payment_methods import set_payment_method_enabled
from apps.orders.services.payments import capture_payment

from .test_api import _reserved_order

pytestmark = pytest.mark.django_db


@pytest.fixture
def checked_out_order():
    return _reserved_order("payment-method-fixture@example.com")


LIST_ENDPOINT = "/api/v1/admin/settings/payment-methods/"


def _detail(key: str) -> str:
    return f"{LIST_ENDPOINT}{key}/"


def test_every_method_defaults_to_offered():
    assert all(row["is_enabled"] for row in payment_methods_list())


def test_disabling_a_method_sticks():
    set_payment_method_enabled(key=PaymentMethodKey.BKASH, is_enabled=False)

    assert is_payment_method_enabled(PaymentMethodKey.BKASH) is False
    assert PaymentMethodSetting.objects.get(key=PaymentMethodKey.BKASH).is_enabled is False
    enabled = {row["key"] for row in payment_methods_list() if row["is_enabled"]}
    assert PaymentMethodKey.BKASH not in enabled


def test_manual_cannot_be_switched_off():
    with pytest.raises(BusinessRuleViolationError) as exc:
        set_payment_method_enabled(key=PaymentMethodKey.MANUAL, is_enabled=False)
    assert exc.value.code == "payment_method_locked"
    assert is_payment_method_enabled(PaymentMethodKey.MANUAL) is True


def test_an_unknown_method_is_rejected():
    with pytest.raises(BusinessRuleViolationError) as exc:
        set_payment_method_enabled(key="barter", is_enabled=False)
    assert exc.value.code == "unknown_payment_method"


def test_an_unknown_key_is_never_enabled():
    assert is_payment_method_enabled("barter") is False


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("bKash", PaymentMethodKey.BKASH),
        ("Cash on Delivery", PaymentMethodKey.COD),
        ("Card", PaymentMethodKey.CARD),
        ("credit card", PaymentMethodKey.CARD),
        ("", PaymentMethodKey.MANUAL),
        ("something nobody planned for", PaymentMethodKey.MANUAL),
    ],
)
def test_legacy_free_text_maps_onto_the_registry(raw, expected):
    assert normalize_payment_method(raw) == expected


def test_capture_refuses_a_switched_off_method(checked_out_order):
    order, _ = checked_out_order
    set_payment_method_enabled(key=PaymentMethodKey.BKASH, is_enabled=False)

    with pytest.raises(BusinessRuleViolationError) as exc:
        capture_payment(order=order, amount=order.grand_total, method=PaymentMethodKey.BKASH)
    assert exc.value.code == "payment_method_disabled"


def test_capture_refuses_a_method_that_is_not_in_the_registry(checked_out_order):
    order, _ = checked_out_order

    with pytest.raises(BusinessRuleViolationError) as exc:
        capture_payment(order=order, amount=order.grand_total, method="barter")
    assert exc.value.code == "unknown_payment_method"


def test_capture_records_an_offered_method(checked_out_order):
    order, _ = checked_out_order

    payment = capture_payment(
        order=order,
        amount=order.grand_total,
        method=PaymentMethodKey.BKASH,
        reference="TRX123456",
    )

    assert payment.method == PaymentMethodKey.BKASH
    assert payment.gateway_reference == "TRX123456"
    assert payment.amount == Decimal(order.grand_total)


def test_admin_can_list_payment_methods(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    response = api_client.get(LIST_ENDPOINT)

    assert response.status_code == 200
    keys = {row["key"] for row in response.data["data"]}
    assert PaymentMethodKey.COD in keys
    assert PaymentMethodKey.MANUAL in keys


def test_admin_can_switch_a_method_off_over_the_api(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    response = api_client.patch(
        _detail(PaymentMethodKey.NAGAD), {"is_enabled": False}, format="json"
    )

    assert response.status_code == 200
    assert response.data["data"]["is_enabled"] is False
    assert is_payment_method_enabled(PaymentMethodKey.NAGAD) is False


def test_api_refuses_to_switch_off_the_locked_method(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    response = api_client.patch(
        _detail(PaymentMethodKey.MANUAL), {"is_enabled": False}, format="json"
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "payment_method_locked"


def test_api_404s_on_an_unknown_method(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    response = api_client.patch(_detail("barter"), {"is_enabled": False}, format="json")

    assert response.status_code == 404


def test_storefront_only_sees_the_methods_on_offer(api_client):
    set_payment_method_enabled(key=PaymentMethodKey.ROCKET, is_enabled=False)

    response = api_client.get("/api/v1/public/payment-methods/")

    assert response.status_code == 200
    keys = {row["key"] for row in response.data["data"]}
    assert PaymentMethodKey.ROCKET not in keys
    assert PaymentMethodKey.COD in keys
    assert "can_disable" not in response.data["data"][0]
