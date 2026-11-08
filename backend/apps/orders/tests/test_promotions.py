from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounts.factories import AddressFactory, CustomerUserFactory
from apps.business.selectors.business_profile import get_business_profile
from apps.catalog.factories import CategoryFactory, ProductVariantFactory
from apps.catalog.models import Brand
from apps.catalog.services.sales import create_sale
from apps.common.exceptions import DomainError
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.orders.factories import CouponFactory
from apps.orders.models import SalesOrder
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.coupons import apply_coupon
from apps.orders.services.staff_orders import quote_staff_order

from .test_public_checkout_api import (
    COUPON_VALIDATE_URL,
    GUEST_CHECKOUT_URL,
    SHIPPING_OPTIONS_URL,
    SHIPPING_QUOTE_URL,
    _configured_delivery,
    _guest_payload,
)

pytestmark = pytest.mark.django_db

VOUCHERS_URL = "/api/v1/public/checkout/coupons/"
ADMIN_COUPONS_URL = "/api/v1/admin/coupons/"
CART_QUOTE_URL = "/api/v1/customer/orders/cart/shipping-quote/"


def _stocked(price="1000.00", **fields):
    variant = ProductVariantFactory(price=Decimal(price), **fields)
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=20,
        unit_cost=Decimal("5.00"),
    )
    return variant


def _storewide_sale(percent="20.00"):
    return create_sale(
        name="Storewide",
        percent_off=Decimal(percent),
        starts_at=timezone.now() - timedelta(days=1),
    )


def _free_delivery_from(amount: str | None) -> None:
    profile = get_business_profile()
    profile.free_delivery_min_amount = None if amount is None else Decimal(amount)
    profile.save(update_fields=["free_delivery_min_amount"])


def _cart(customer, *variants):
    cart = get_or_create_cart(customer)
    for variant in variants:
        add_line(order=cart, variant=variant, quantity=1)
    cart.refresh_from_db()
    return cart


def _items(*variants):
    return [{"variant_id": str(variant.id), "quantity": 1} for variant in variants]


def _refusal(order, code) -> str:
    with pytest.raises(DomainError) as refused:
        apply_coupon(order=order, code=code)
    return refused.value.code


def _address(customer):
    return AddressFactory(user=customer, city="Dhaka", country="Bangladesh")


# ---- sale price at checkout ------------------------------------------------


def test_guest_checkout_charges_the_sale_price(api_client):
    variant = _stocked("1000.00")
    _configured_delivery()
    _storewide_sale("20.00")

    response = api_client.post(GUEST_CHECKOUT_URL, _guest_payload(variant), format="json")

    assert response.status_code == 201, response.data
    assert Decimal(response.data["data"]["subtotal"]) == Decimal("800.00")
    assert SalesOrder.objects.get().lines.get().unit_price == Decimal("800.00")


def test_a_cart_filled_before_the_sale_is_charged_the_sale_price_at_checkout():
    customer = CustomerUserFactory()
    _zone, carrier = _configured_delivery()
    cart = _cart(customer, _stocked("1000.00"))
    assert cart.subtotal == Decimal("1000.00")
    _storewide_sale("20.00")

    order = checkout(order=cart, shipping_address=_address(customer), carrier=carrier)

    assert order.subtotal == Decimal("800.00")


def test_a_coupon_stacks_on_the_sale_price(api_client):
    variant = _stocked("1000.00")
    _configured_delivery()
    _storewide_sale("20.00")
    CouponFactory(code="TEN", value=Decimal("10"))

    response = api_client.post(
        GUEST_CHECKOUT_URL, _guest_payload(variant, coupon_code="TEN"), format="json"
    )

    assert Decimal(response.data["data"]["subtotal"]) == Decimal("800.00")
    assert Decimal(response.data["data"]["discount_total"]) == Decimal("80.00")


# ---- coupon start date -----------------------------------------------------


def test_a_coupon_cannot_be_used_before_it_starts(api_client):
    customer = CustomerUserFactory()
    variant = _stocked()
    CouponFactory(code="SOON", starts_at=timezone.now() + timedelta(days=1))
    CouponFactory(code="OPEN", starts_at=timezone.now() - timedelta(days=1))

    assert _refusal(_cart(customer, variant), "SOON") == "coupon_not_started"
    preview = api_client.post(
        COUPON_VALIDATE_URL, {"code": "SOON", "items": _items(variant)}, format="json"
    )
    assert preview.status_code == 400
    assert preview.data["error"]["code"] == "coupon_not_started"
    assert apply_coupon(order=_cart(customer), code="OPEN").coupon.code == "OPEN"


def test_voucher_list_hides_a_coupon_until_it_starts_and_shows_the_new_fields(api_client):
    CouponFactory(
        code="LATER", show_on_storefront=True, starts_at=timezone.now() + timedelta(days=1)
    )
    CouponFactory(
        code="NOW",
        show_on_storefront=True,
        starts_at=timezone.now() - timedelta(days=1),
        max_discount_amount=Decimal("250.00"),
    )

    rows = api_client.get(VOUCHERS_URL).data["data"]

    assert [row["code"] for row in rows] == ["NOW"]
    assert rows[0]["max_discount_amount"] == "250.00"
    assert rows[0]["starts_at"] is not None


# ---- coupon scope ----------------------------------------------------------


def test_a_category_coupon_discounts_only_matching_lines_children_included(api_client):
    parent = CategoryFactory()
    child = CategoryFactory(parent=parent)
    covered = _stocked("1000.00", product__category=child)
    other = _stocked("500.00")
    coupon = CouponFactory(code="KNIT", value=Decimal("10"))
    coupon.categories.set([parent])

    order = apply_coupon(order=_cart(CustomerUserFactory(), covered, other), code="KNIT")
    preview = api_client.post(
        COUPON_VALIDATE_URL, {"code": "KNIT", "items": _items(covered, other)}, format="json"
    )

    assert order.subtotal == Decimal("1500.00")
    assert order.discount_total == Decimal("100.00")
    assert preview.data["data"]["discount_amount"] == "100.00"


def test_a_brand_coupon_discounts_only_that_brands_lines():
    brand = Brand.objects.create(name="Aarong", slug="aarong", kind="stock")
    covered = _stocked("400.00", product__brand=brand)
    other = _stocked("600.00")
    coupon = CouponFactory(code="BRAND", discount_type="fixed", value=Decimal("900.00"))
    coupon.brands.set([brand])

    order = apply_coupon(order=_cart(CustomerUserFactory(), covered, other), code="BRAND")

    assert order.discount_total == Decimal("400.00")


def test_a_scoped_coupon_with_no_matching_line_is_refused(api_client):
    variant = _stocked()
    coupon = CouponFactory(code="ELSEWHERE")
    coupon.categories.set([CategoryFactory()])

    assert _refusal(_cart(CustomerUserFactory(), variant), "ELSEWHERE") == "coupon_not_applicable"
    preview = api_client.post(
        COUPON_VALIDATE_URL, {"code": "ELSEWHERE", "items": _items(variant)}, format="json"
    )
    assert preview.data["error"]["code"] == "coupon_not_applicable"


def test_the_minimum_order_is_checked_against_the_whole_subtotal():
    category = CategoryFactory()
    covered = _stocked("300.00", product__category=category)
    other = _stocked("800.00")
    coupon = CouponFactory(code="MIN", value=Decimal("10"), min_order_amount=Decimal("1000.00"))
    coupon.categories.set([category])

    order = apply_coupon(order=_cart(CustomerUserFactory(), covered, other), code="MIN")

    assert order.discount_total == Decimal("30.00")
    assert _refusal(_cart(CustomerUserFactory(), covered), "MIN") == "coupon_minimum_not_met"


def test_the_discount_is_recomputed_when_the_cart_changes_before_checkout():
    customer = CustomerUserFactory()
    _zone, carrier = _configured_delivery()
    category = CategoryFactory()
    covered = _stocked("1000.00", product__category=category)
    coupon = CouponFactory(code="KNIT", value=Decimal("10"))
    coupon.categories.set([category])
    cart = apply_coupon(order=_cart(customer, covered), code="KNIT")
    add_line(order=cart, variant=covered, quantity=1)

    order = checkout(order=cart, shipping_address=_address(customer), carrier=carrier)

    assert order.discount_total == Decimal("200.00")


# ---- coupon cap ------------------------------------------------------------


def test_max_discount_amount_caps_a_percentage_coupon(api_client):
    variant = _stocked("10000.00")
    CouponFactory(code="CAP", value=Decimal("25"), max_discount_amount=Decimal("500.00"))

    order = apply_coupon(order=_cart(CustomerUserFactory(), variant), code="CAP")
    preview = api_client.post(
        COUPON_VALIDATE_URL, {"code": "CAP", "items": _items(variant)}, format="json"
    )

    assert order.discount_total == Decimal("500.00")
    assert preview.data["data"]["discount_amount"] == "500.00"


# ---- per-customer limit ----------------------------------------------------


def test_a_signed_in_customer_cannot_exceed_the_per_customer_limit(api_client):
    customer = CustomerUserFactory()
    _zone, carrier = _configured_delivery()
    variant = _stocked()
    CouponFactory(code="ONCE", per_customer_limit=1)
    first = apply_coupon(order=_cart(customer, variant), code="ONCE")
    checkout(order=first, shipping_address=_address(customer), carrier=carrier)

    assert _refusal(_cart(customer, variant), "ONCE") == "coupon_customer_limit_reached"
    api_client.force_authenticate(user=customer)
    preview = api_client.post(
        COUPON_VALIDATE_URL, {"code": "ONCE", "items": _items(variant)}, format="json"
    )
    assert preview.data["error"]["code"] == "coupon_customer_limit_reached"
    someone_else = CustomerUserFactory()
    assert apply_coupon(order=_cart(someone_else, variant), code="ONCE").coupon_id


def test_a_cancelled_order_does_not_count_towards_the_per_customer_limit():
    customer = CustomerUserFactory()
    _zone, carrier = _configured_delivery()
    variant = _stocked()
    CouponFactory(code="ONCE", per_customer_limit=1)
    first = apply_coupon(order=_cart(customer, variant), code="ONCE")
    checkout(order=first, shipping_address=_address(customer), carrier=carrier)
    SalesOrder.objects.filter(id=first.id).update(status=SalesOrder.Status.CANCELLED)

    assert apply_coupon(order=_cart(customer, variant), code="ONCE").coupon_id


def test_a_guest_is_limited_by_the_phone_their_orders_carry(api_client):
    variant = _stocked("100.00")
    _configured_delivery()
    CouponFactory(code="ONCE", value=Decimal("10"), per_customer_limit=1)
    payload = _guest_payload(variant, coupon_code="ONCE")

    first = api_client.post(GUEST_CHECKOUT_URL, payload, format="json")
    second = api_client.post(GUEST_CHECKOUT_URL, payload, format="json")
    preview = api_client.post(
        COUPON_VALIDATE_URL,
        {"code": "ONCE", "items": _items(variant), "phone": payload["phone"]},
        format="json",
    )
    other_phone = api_client.post(
        COUPON_VALIDATE_URL,
        {"code": "ONCE", "items": _items(variant), "phone": "+8801811111111"},
        format="json",
    )

    assert Decimal(first.data["data"]["discount_total"]) == Decimal("10.00")
    assert second.status_code == 201
    assert Decimal(second.data["data"]["discount_total"]) == Decimal("0.00")
    assert preview.data["error"]["code"] == "coupon_customer_limit_reached"
    assert other_phone.status_code == 200


# ---- admin coupon API ------------------------------------------------------


def test_admin_coupon_api_reads_and_writes_the_new_fields(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    category = CategoryFactory(name="Knitwear")
    brand = Brand.objects.create(name="Aarong", slug="aarong", kind="stock")
    starts_at = timezone.now() + timedelta(days=1)

    created = api_client.post(
        ADMIN_COUPONS_URL,
        {
            "code": "scoped",
            "discount_type": "percentage",
            "value": "10.00",
            "starts_at": starts_at.isoformat(),
            "per_customer_limit": 2,
            "max_discount_amount": "300.00",
            "category_ids": [str(category.id)],
            "brand_ids": [str(brand.id)],
        },
        format="json",
    )

    assert created.status_code == 201, created.data
    row = created.data["data"]
    assert row["per_customer_limit"] == 2
    assert row["max_discount_amount"] == "300.00"
    assert row["starts_at"] is not None
    assert [dict(item) for item in row["categories"]] == [
        {"id": str(category.id), "name": "Knitwear"}
    ]
    assert [dict(item) for item in row["brands"]] == [{"id": str(brand.id), "name": "Aarong"}]

    cleared = api_client.patch(
        f"{ADMIN_COUPONS_URL}{row['id']}/",
        {"category_ids": [], "per_customer_limit": None},
        format="json",
    )
    assert cleared.status_code == 200, cleared.data
    assert cleared.data["data"]["categories"] == []
    assert cleared.data["data"]["per_customer_limit"] is None
    assert [item["name"] for item in cleared.data["data"]["brands"]] == ["Aarong"]
    listed = api_client.get(ADMIN_COUPONS_URL).data["data"]["results"][0]
    assert "categories" in listed
    assert "brands" in listed


# ---- free delivery ---------------------------------------------------------


@pytest.mark.parametrize(
    ("threshold", "charge", "free"),
    [("1000.00", "0.00", True), ("1000.01", "60.00", False), ("0", "60.00", False)],
)
def test_guest_checkout_and_quote_drop_the_charge_at_the_threshold(
    api_client, threshold, charge, free
):
    variant = _stocked("1000.00")
    _configured_delivery()
    _free_delivery_from(threshold)

    quote = api_client.post(
        SHIPPING_QUOTE_URL, {"items": _items(variant), "address_text": "Dhaka"}, format="json"
    )
    options = api_client.post(
        SHIPPING_OPTIONS_URL, {"items": _items(variant), "address_text": "Dhaka"}, format="json"
    )
    order = api_client.post(GUEST_CHECKOUT_URL, _guest_payload(variant), format="json")

    assert quote.status_code == 200, quote.data
    assert quote.data["data"]["shipping_total"] == charge
    assert quote.data["data"]["free_delivery"] is free
    assert options.data["data"]["free_delivery"] is free
    assert Decimal(options.data["data"]["options"][0]["cost"]) == Decimal(charge)
    assert order.status_code == 201, order.data
    assert Decimal(order.data["data"]["shipping_total"]) == Decimal(charge)


def test_free_delivery_is_off_until_an_amount_is_set(api_client):
    variant = _stocked("99999.00")
    _configured_delivery()

    quote = api_client.post(
        SHIPPING_QUOTE_URL, {"items": _items(variant), "address_text": "Dhaka"}, format="json"
    )

    assert quote.data["data"]["shipping_total"] == "60.00"
    assert quote.data["data"]["free_delivery"] is False


def test_the_threshold_counts_sale_prices_but_not_the_coupon(api_client):
    variant = _stocked("1000.00")
    _configured_delivery()
    CouponFactory(code="HALF", value=Decimal("50"))
    _free_delivery_from("900.00")

    with_coupon = api_client.post(
        GUEST_CHECKOUT_URL, _guest_payload(variant, coupon_code="HALF"), format="json"
    )
    _storewide_sale("20.00")
    with_sale = api_client.post(GUEST_CHECKOUT_URL, _guest_payload(variant), format="json")

    assert Decimal(with_coupon.data["data"]["discount_total"]) == Decimal("500.00")
    assert Decimal(with_coupon.data["data"]["shipping_total"]) == Decimal("0.00")
    assert Decimal(with_sale.data["data"]["subtotal"]) == Decimal("800.00")
    assert Decimal(with_sale.data["data"]["shipping_total"]) == Decimal("60.00")


def test_a_customer_cart_gets_free_delivery_on_quote_and_checkout(api_client):
    customer = CustomerUserFactory()
    zone, carrier = _configured_delivery()
    cart = _cart(customer, _stocked("1500.00"))
    _free_delivery_from("1000.00")
    api_client.force_authenticate(user=customer)

    quote = api_client.post(CART_QUOTE_URL, {"zone_id": str(zone.id)}, format="json")
    order = checkout(order=cart, shipping_address=_address(customer), carrier=carrier)

    assert quote.status_code == 200, quote.data
    assert quote.data["data"]["shipping_total"] == "0.00"
    assert quote.data["data"]["free_delivery"] is True
    assert order.shipping_total == Decimal("0.00")
    assert order.grand_total == order.subtotal + order.tax_total


def test_a_staff_order_quote_gets_free_delivery_too():
    customer = CustomerUserFactory()
    _zone, carrier = _configured_delivery()
    variant = _stocked("1500.00")
    _free_delivery_from("1000.00")

    quote = quote_staff_order(
        lines=[(variant, 1)], shipping_address=_address(customer), carrier=carrier
    )

    assert quote["shipping_total"] == Decimal("0.00")
    assert quote["free_delivery"] is True
