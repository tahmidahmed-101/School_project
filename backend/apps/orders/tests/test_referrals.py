from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounts.constants import UserRole
from apps.accounts.factories import CustomerUserFactory
from apps.accounts.tests.helpers import create_user
from apps.business.selectors.business_profile import get_business_profile
from apps.catalog.factories import ProductVariantFactory
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.orders.factories import CouponFactory
from apps.orders.models import Coupon, Referral, SalesOrder, Shipment
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.coupons import apply_coupon
from apps.orders.services.orders import cancel_order, set_order_status
from apps.orders.services.payments import capture_payment
from apps.orders.services.referrals import (
    REWARD_VALID_DAYS,
    referral_code_for,
    reward_referral,
)
from apps.orders.services.shipments import create_shipment, update_shipment_status

pytestmark = pytest.mark.django_db

FRIEND_DISCOUNT = Decimal("50.00")
REWARD = Decimal("30.00")
COUPON_URL = "/api/v1/customer/orders/cart/coupon/"
VALIDATE_URL = "/api/v1/public/checkout/coupon/"


@pytest.fixture
def program_on():
    profile = get_business_profile()
    profile.referral_friend_discount = FRIEND_DISCOUNT
    profile.referral_reward_amount = REWARD
    profile.save()


def _variant(price: Decimal = Decimal("200.00")):
    variant = ProductVariantFactory(price=price)
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=20,
        unit_cost=Decimal("5"),
    )
    return variant


def _referrer(phone: str = "01711111111"):
    return CustomerUserFactory(phone=phone, email="referrer@example.com")


def _friend(phone: str = "01722222222"):
    return CustomerUserFactory(phone=phone, email="friend@example.com")


def _cart(customer):
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=_variant(), quantity=1)
    cart.refresh_from_db()
    return cart


def _friend_order(friend, code: str) -> SalesOrder:
    cart = _cart(friend)
    apply_coupon(order=cart, code=code)
    checkout(order=cart)
    cart.refresh_from_db()
    return cart


def _deliver(order: SalesOrder) -> None:
    capture_payment(order=order, amount=order.grand_total)
    order.refresh_from_db()
    lines = [{"order_line": line, "quantity": line.quantity} for line in order.lines.all()]
    shipment = create_shipment(order=order, lines=lines)
    update_shipment_status(shipment=shipment, status=Shipment.Status.DELIVERED)
    order.refresh_from_db()


def test_program_is_off_until_both_amounts_are_set():
    referrer = _referrer()
    assert referral_code_for(referrer) is None

    profile = get_business_profile()
    profile.referral_friend_discount = FRIEND_DISCOUNT
    profile.save()
    assert referral_code_for(referrer) is None


def test_share_code_is_made_once_and_kept(program_on):
    referrer = _referrer()

    first = referral_code_for(referrer)
    second = referral_code_for(referrer)

    assert first.id == second.id
    assert first.referrer_id == referrer.id
    assert len(first.code) == 7


def test_friend_gets_fixed_discount_through_the_coupon_endpoint(program_on, api_client):
    code = referral_code_for(_referrer()).code
    friend = _friend()
    api_client.force_authenticate(user=friend)
    _cart(friend)

    response = api_client.post(COUPON_URL, {"code": code.lower()}, format="json")

    assert response.status_code == 200, response.data
    assert Decimal(response.data["data"]["discount_total"]) == FRIEND_DISCOUNT


def test_code_stops_working_when_program_is_switched_off(program_on, api_client):
    code = referral_code_for(_referrer()).code
    profile = get_business_profile()
    profile.referral_reward_amount = Decimal("0")
    profile.save()
    friend = _friend()
    api_client.force_authenticate(user=friend)
    _cart(friend)

    response = api_client.post(COUPON_URL, {"code": code}, format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "invalid_coupon"


def test_referrer_cannot_use_their_own_code(program_on, api_client):
    referrer = _referrer()
    code = referral_code_for(referrer).code
    api_client.force_authenticate(user=referrer)
    _cart(referrer)

    response = api_client.post(COUPON_URL, {"code": code}, format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "referral_own_code"


def test_second_account_with_the_referrers_phone_is_refused(program_on, api_client):
    code = referral_code_for(_referrer(phone="01711111111")).code
    twin = CustomerUserFactory(phone="+8801711111111", email="twin@example.com")
    api_client.force_authenticate(user=twin)
    _cart(twin)

    response = api_client.post(COUPON_URL, {"code": code}, format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "referral_own_code"


def test_code_works_on_the_first_order_only(program_on, api_client):
    code = referral_code_for(_referrer()).code
    friend = _friend()
    _friend_order(friend, code)
    api_client.force_authenticate(user=friend)
    _cart(friend)

    response = api_client.post(COUPON_URL, {"code": code}, format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "referral_not_first_order"


def test_a_cancelled_first_order_does_not_use_up_the_first_order(program_on):
    code = referral_code_for(_referrer()).code
    friend = _friend()
    first = _friend_order(friend, code)
    cancel_order(order=first)

    second = _friend_order(friend, code)

    assert Decimal(second.discount_total) == FRIEND_DISCOUNT
    assert Referral.objects.filter(order=second, status=Referral.Status.PENDING).exists()


def test_another_coupon_replaces_the_referral_code_so_nothing_is_recorded(program_on):
    code = referral_code_for(_referrer()).code
    friend = _friend()
    cart = _cart(friend)
    apply_coupon(order=cart, code=code)
    CouponFactory(code="OTHER10", discount_type=Coupon.DiscountType.FIXED, value=Decimal("10"))
    apply_coupon(order=cart, code="OTHER10")
    checkout(order=cart)

    assert not Referral.objects.exists()


def test_placing_the_order_records_a_pending_referral_without_a_reward(program_on):
    referrer = _referrer()
    order = _friend_order(_friend(), referral_code_for(referrer).code)

    referral = Referral.objects.get(order=order)

    assert referral.status == Referral.Status.PENDING
    assert referral.referrer_id == referrer.id
    assert referral.reward_amount == REWARD
    assert referral.reward_coupon_id is None


def test_delivery_issues_one_single_use_reward_coupon(program_on):
    referrer = _referrer()
    order = _friend_order(_friend(), referral_code_for(referrer).code)

    _deliver(order)

    referral = Referral.objects.get(order=order)
    reward = referral.reward_coupon
    assert referral.status == Referral.Status.REWARDED
    assert reward.value == REWARD
    assert reward.discount_type == Coupon.DiscountType.FIXED
    assert reward.usage_limit == 1
    assert reward.referrer_id is None
    assert reward.code.startswith("RW-")
    expected_expiry = timezone.now() + timedelta(days=REWARD_VALID_DAYS)
    assert abs(reward.expires_at - expected_expiry) < timedelta(minutes=1)


def test_a_repeated_delivery_does_not_reward_twice(program_on):
    referrer = _referrer()
    order = _friend_order(_friend(), referral_code_for(referrer).code)
    _deliver(order)

    reward_referral(order)
    set_order_status(order=order, new_status=SalesOrder.Status.CLOSED)
    reward_referral(order)

    assert Coupon.objects.filter(code__startswith="RW-").count() == 1
    assert Referral.objects.filter(status=Referral.Status.REWARDED).count() == 1


def test_cancelling_before_delivery_voids_the_referral(program_on):
    order = _friend_order(_friend(), referral_code_for(_referrer()).code)

    cancel_order(order=order)
    reward_referral(order)

    referral = Referral.objects.get(order=order)
    assert referral.status == Referral.Status.VOID
    assert not Coupon.objects.filter(code__startswith="RW-").exists()


def test_a_later_change_of_the_reward_setting_does_not_move_a_pending_reward(program_on):
    order = _friend_order(_friend(), referral_code_for(_referrer()).code)
    profile = get_business_profile()
    profile.referral_reward_amount = Decimal("99.00")
    profile.save()

    _deliver(order)

    assert Referral.objects.get(order=order).reward_coupon.value == REWARD


def test_reward_for_a_self_referral_that_slipped_through_is_void(program_on):
    referrer = _referrer()
    order = _friend_order(_friend(), referral_code_for(referrer).code)
    SalesOrder.objects.filter(pk=order.pk).update(customer=referrer)
    order.refresh_from_db()
    _deliver(order)

    assert Referral.objects.get(order=order).status == Referral.Status.VOID
    assert not Coupon.objects.filter(code__startswith="RW-").exists()


def test_referral_codes_stay_out_of_the_staff_coupon_list(program_on, api_client):
    code = referral_code_for(_referrer()).code
    admin = create_user(email="referral-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.get("/api/v1/admin/coupons/")

    codes = [row["code"] for row in response.data["data"]["results"]]
    assert code not in codes


def test_guest_validate_accepts_a_referral_code(program_on, api_client):
    code = referral_code_for(_referrer()).code
    variant = _variant(Decimal("200.00"))

    response = api_client.post(
        VALIDATE_URL,
        {
            "code": code,
            "phone": "01733333333",
            "items": [{"variant_id": str(variant.id), "quantity": 1}],
        },
        format="json",
    )

    assert response.status_code == 200, response.data
    assert response.data["data"]["discount_amount"] == "50.00"


def test_guest_validate_refuses_the_referrers_own_phone(program_on, api_client):
    code = referral_code_for(_referrer(phone="01711111111")).code
    variant = _variant()

    response = api_client.post(
        VALIDATE_URL,
        {
            "code": code,
            "phone": "+8801711111111",
            "items": [{"variant_id": str(variant.id), "quantity": 1}],
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "referral_own_code"


def test_customer_sees_code_amounts_and_earned_rewards(program_on, api_client):
    referrer = _referrer()
    order = _friend_order(_friend(), referral_code_for(referrer).code)
    _deliver(order)
    api_client.force_authenticate(user=referrer)

    response = api_client.get("/api/v1/customer/referral/")

    data = response.data["data"]
    assert response.status_code == 200
    assert data["enabled"] is True
    assert data["code"] == Coupon.objects.get(referrer=referrer).code
    assert Decimal(data["friend_discount"]) == FRIEND_DISCOUNT
    assert len(data["rewards"]) == 1
    assert data["rewards"][0]["used"] is False
    assert Decimal(data["rewards"][0]["amount"]) == REWARD


def test_customer_summary_when_program_is_off(api_client):
    referrer = _referrer()
    api_client.force_authenticate(user=referrer)

    response = api_client.get("/api/v1/customer/referral/")

    assert response.status_code == 200
    assert response.data["data"]["enabled"] is False
    assert response.data["data"]["code"] is None
    assert not Coupon.objects.filter(referrer=referrer).exists()


def test_admin_lists_referrals_and_a_customer_cannot(program_on, api_client):
    referrer = _referrer()
    order = _friend_order(_friend(), referral_code_for(referrer).code)
    admin = create_user(email="referral-admin2@example.com", role=UserRole.ADMIN)

    api_client.force_authenticate(user=referrer)
    assert api_client.get("/api/v1/admin/referrals/").status_code == 403

    api_client.force_authenticate(user=admin)
    response = api_client.get("/api/v1/admin/referrals/?status=pending")

    assert response.status_code == 200
    rows = response.data["data"]["results"]
    assert [row["order_number"] for row in rows] == [order.order_number]
    assert rows[0]["status"] == "pending"
    assert rows[0]["reward_coupon_code"] is None
