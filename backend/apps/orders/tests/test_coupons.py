from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductVariantFactory
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.orders.factories import CouponFactory
from apps.orders.models import Coupon, SalesOrder
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.coupons import apply_coupon

pytestmark = pytest.mark.django_db


def _stocked_variant(quantity: int = 10, price: Decimal = Decimal("100.00")):
    variant = ProductVariantFactory(price=price)
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=quantity,
        unit_cost=Decimal("5.00"),
    )
    return variant


def _cart_with_line(customer, quantity: int = 1, price: Decimal = Decimal("100.00")):
    variant = _stocked_variant(price=price)
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=quantity)
    cart.refresh_from_db()
    return cart


def test_customer_can_apply_percentage_coupon(api_client):
    customer = create_user(email="coupon-percent@example.com")
    api_client.force_authenticate(user=customer)
    _cart_with_line(customer, quantity=1, price=Decimal("100.00"))
    CouponFactory(code="SAVE10", discount_type=Coupon.DiscountType.PERCENTAGE, value=Decimal("10"))

    response = api_client.post(
        "/api/v1/customer/orders/cart/coupon/", {"code": "save10"}, format="json"
    )

    assert response.status_code == 200
    assert response.data["data"]["coupon_code"] == "SAVE10"
    assert Decimal(response.data["data"]["discount_total"]) == Decimal("10.00")
    assert Decimal(response.data["data"]["grand_total"]) == Decimal("90.00")


def test_customer_can_apply_fixed_coupon(api_client):
    customer = create_user(email="coupon-fixed@example.com")
    api_client.force_authenticate(user=customer)
    _cart_with_line(customer, quantity=1, price=Decimal("100.00"))
    CouponFactory(code="FLAT20", discount_type=Coupon.DiscountType.FIXED, value=Decimal("20.00"))

    response = api_client.post(
        "/api/v1/customer/orders/cart/coupon/", {"code": "FLAT20"}, format="json"
    )

    assert response.status_code == 200
    assert Decimal(response.data["data"]["discount_total"]) == Decimal("20.00")


def test_fixed_coupon_never_discounts_below_zero(api_client):
    customer = create_user(email="coupon-clamp@example.com")
    api_client.force_authenticate(user=customer)
    _cart_with_line(customer, quantity=1, price=Decimal("10.00"))
    CouponFactory(code="BIGFLAT", discount_type=Coupon.DiscountType.FIXED, value=Decimal("500.00"))

    response = api_client.post(
        "/api/v1/customer/orders/cart/coupon/", {"code": "BIGFLAT"}, format="json"
    )

    assert response.status_code == 200
    assert Decimal(response.data["data"]["grand_total"]) == Decimal("0.00")


def test_invalid_coupon_code_is_rejected(api_client):
    customer = create_user(email="coupon-invalid@example.com")
    api_client.force_authenticate(user=customer)
    _cart_with_line(customer)

    response = api_client.post(
        "/api/v1/customer/orders/cart/coupon/", {"code": "NOPE"}, format="json"
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "invalid_coupon"


def test_expired_coupon_is_rejected(api_client):
    customer = create_user(email="coupon-expired@example.com")
    api_client.force_authenticate(user=customer)
    _cart_with_line(customer)
    CouponFactory(code="OLD10", expires_at=timezone.now() - timedelta(days=1))

    response = api_client.post(
        "/api/v1/customer/orders/cart/coupon/", {"code": "OLD10"}, format="json"
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "coupon_expired"


def test_coupon_usage_limit_is_enforced(api_client):
    coupon = CouponFactory(code="LIMITED", usage_limit=1, times_used=1)
    customer = create_user(email="coupon-limit@example.com")
    api_client.force_authenticate(user=customer)
    _cart_with_line(customer)

    response = api_client.post(
        "/api/v1/customer/orders/cart/coupon/", {"code": "LIMITED"}, format="json"
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "coupon_usage_limit_reached"
    coupon.refresh_from_db()
    assert coupon.times_used == 1


def test_coupon_minimum_order_amount_is_enforced(api_client):
    customer = create_user(email="coupon-minimum@example.com")
    api_client.force_authenticate(user=customer)
    _cart_with_line(customer, price=Decimal("10.00"))
    CouponFactory(code="BIGORDER", min_order_amount=Decimal("50.00"))

    response = api_client.post(
        "/api/v1/customer/orders/cart/coupon/", {"code": "BIGORDER"}, format="json"
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "coupon_minimum_not_met"


def test_customer_can_remove_applied_coupon(api_client):
    customer = create_user(email="coupon-remove@example.com")
    api_client.force_authenticate(user=customer)
    _cart_with_line(customer, price=Decimal("100.00"))
    CouponFactory(code="REMOVEME", value=Decimal("10"))
    api_client.post("/api/v1/customer/orders/cart/coupon/", {"code": "REMOVEME"}, format="json")

    response = api_client.delete("/api/v1/customer/orders/cart/coupon/")

    assert response.status_code == 200
    assert response.data["data"].get("coupon_code") is None
    assert Decimal(response.data["data"]["discount_total"]) == Decimal("0.00")


def test_reapplying_a_different_coupon_releases_the_previous_one(api_client):
    first = CouponFactory(code="FIRST10", usage_limit=1)
    second = CouponFactory(code="SECOND10", usage_limit=1)
    customer = create_user(email="coupon-swap@example.com")
    api_client.force_authenticate(user=customer)
    _cart_with_line(customer, price=Decimal("100.00"))

    api_client.post("/api/v1/customer/orders/cart/coupon/", {"code": "FIRST10"}, format="json")
    response = api_client.post(
        "/api/v1/customer/orders/cart/coupon/", {"code": "SECOND10"}, format="json"
    )

    assert response.status_code == 200
    first.refresh_from_db()
    second.refresh_from_db()
    assert first.times_used == 0
    assert second.times_used == 1


def test_reapplying_the_same_coupon_does_not_increment_times_used(api_client):
    coupon = CouponFactory(code="SAME10", usage_limit=5)
    customer = create_user(email="coupon-reapply@example.com")
    api_client.force_authenticate(user=customer)
    _cart_with_line(customer, price=Decimal("100.00"))

    first = api_client.post(
        "/api/v1/customer/orders/cart/coupon/", {"code": "SAME10"}, format="json"
    )
    second = api_client.post(
        "/api/v1/customer/orders/cart/coupon/", {"code": "same10"}, format="json"
    )

    assert first.status_code == 200
    assert second.status_code == 200
    coupon.refresh_from_db()
    assert coupon.times_used == 1


def test_concurrent_coupon_applies_do_not_corrupt_times_used():
    """apply_coupon locks the order row and refreshes before reading
    coupon_id — otherwise two concurrent applies, each holding its own
    stale in-memory order reference, could both see no coupon attached,
    both take the 'brand new apply' branch, and the second write would
    silently overwrite the first: both coupons' times_used go up, but only
    one ends up attached to the order."""
    customer = create_user(email="coupon-concurrent@example.com")
    cart = _cart_with_line(customer, price=Decimal("100.00"))
    first_coupon = CouponFactory(code="FIRSTCONC")
    second_coupon = CouponFactory(code="SECONDCONC")

    # Two independent, stale in-memory references to the same order — as if
    # two concurrent requests had each fetched it before either wrote.
    stale_a = SalesOrder.objects.get(pk=cart.pk)
    stale_b = SalesOrder.objects.get(pk=cart.pk)

    apply_coupon(order=stale_a, code=first_coupon.code)
    apply_coupon(order=stale_b, code=second_coupon.code)

    first_coupon.refresh_from_db()
    second_coupon.refresh_from_db()
    cart.refresh_from_db()

    assert first_coupon.times_used == 0
    assert second_coupon.times_used == 1
    assert cart.coupon_id == second_coupon.id


def test_admin_can_create_and_list_coupons(api_client):
    admin = create_user(email="coupon-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.post(
        "/api/v1/admin/coupons/",
        {"code": "newyear", "discount_type": "percentage", "value": "15.00"},
        format="json",
    )

    assert response.status_code == 201, response.data
    assert response.data["data"]["code"] == "NEWYEAR"

    list_response = api_client.get("/api/v1/admin/coupons/")
    assert list_response.status_code == 200
    codes = [row["code"] for row in list_response.data["data"]["results"]]
    assert "NEWYEAR" in codes


def test_admin_cannot_create_duplicate_coupon_code(api_client):
    admin = create_user(email="coupon-admin-dup@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    CouponFactory(code="DUPE")

    response = api_client.post(
        "/api/v1/admin/coupons/",
        {"code": "dupe", "discount_type": "fixed", "value": "5.00"},
        format="json",
    )

    assert response.status_code == 409
    assert response.data["error"]["code"] == "duplicate_coupon_code"


def test_customer_cannot_manage_admin_coupons(api_client):
    customer = create_user(email="coupon-customer-blocked@example.com")
    api_client.force_authenticate(user=customer)

    response = api_client.get("/api/v1/admin/coupons/")

    assert response.status_code == 403


STOREFRONT_COUPONS_URL = "/api/v1/public/checkout/coupons/"


def test_storefront_lists_only_coupons_flagged_for_it(api_client):
    CouponFactory(
        code="PUBLIC10",
        show_on_storefront=True,
        value=Decimal("10"),
        min_order_amount=Decimal("500"),
    )
    CouponFactory(code="PRIVATE10")

    response = api_client.get(STOREFRONT_COUPONS_URL)

    assert response.status_code == 200
    assert response.data["data"] == [
        {
            "code": "PUBLIC10",
            "discount_type": "percentage",
            "value": "10.00",
            "min_order_amount": "500.00",
            "max_discount_amount": None,
            "starts_at": None,
            "expires_at": None,
        }
    ]


def test_storefront_hides_coupons_that_can_no_longer_be_redeemed(api_client):
    CouponFactory(code="LIVE", show_on_storefront=True, usage_limit=5, times_used=4)
    CouponFactory(code="INACTIVE", show_on_storefront=True, is_active=False)
    CouponFactory(
        code="EXPIRED", show_on_storefront=True, expires_at=timezone.now() - timedelta(days=1)
    )
    CouponFactory(code="USEDUP", show_on_storefront=True, usage_limit=5, times_used=5)
    CouponFactory(code="DELETED", show_on_storefront=True, deleted_at=timezone.now())

    response = api_client.get(STOREFRONT_COUPONS_URL)

    assert [row["code"] for row in response.data["data"]] == ["LIVE"]


def test_admin_can_flag_a_coupon_for_the_storefront(api_client):
    admin = create_user(email="coupon-admin-flag@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    created = api_client.post(
        "/api/v1/admin/coupons/",
        {"code": "shown", "value": "15.00", "show_on_storefront": True},
        format="json",
    )
    assert created.status_code == 201, created.data
    assert created.data["data"]["show_on_storefront"] is True

    hidden = api_client.patch(
        f"/api/v1/admin/coupons/{created.data['data']['id']}/",
        {"show_on_storefront": False},
        format="json",
    )
    assert hidden.status_code == 200
    assert hidden.data["data"]["show_on_storefront"] is False
    assert api_client.get(STOREFRONT_COUPONS_URL).data["data"] == []
