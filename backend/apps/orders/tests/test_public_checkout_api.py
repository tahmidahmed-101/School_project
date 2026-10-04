from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from django.db import IntegrityError, connection, transaction
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.accounts.factories import (
    AddressFactory,
    AdminUserFactory,
    CustomerUserFactory,
    StaffUserFactory,
)
from apps.accounts.models import Address, User
from apps.accounts.services.users import get_or_create_guest_customer
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
            "city": "Dhaka",
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


def _dhaka_delivery():
    """Mirrors logistics migration 0010: a keyword-matched Inside Dhaka zone at
    70 and a keyword-less (catch-all) Outside Dhaka zone at 110."""
    carrier = CarrierFactory()
    for keywords, charge in ((["dhaka"], "70.00"), ([], "110.00")):
        ShippingRateFactory(
            zone=ShippingZoneFactory(country_codes=keywords),
            carrier=carrier,
            base_weight=Decimal("0"),
            base_charge=Decimal(charge),
            increment_weight=Decimal("1"),
            increment_charge=Decimal("0"),
        )


def _minimal_payload(variant, *, city="Dhaka"):
    """Only the checkout form's fields: name, phone, district/city, address,
    payment method and items — no email."""
    return {
        "first_name": "Rahim Uddin",
        "phone": "+8801711111111",
        "items": [{"variant_id": str(variant.id), "quantity": 2}],
        "shipping_address": {"line1": "House 5, Road 3", "city": city},
        "payment_method": "cod",
    }


def test_guest_checkout_accepts_only_the_checkout_form_fields(api_client):
    variant = _stocked_variant()
    _dhaka_delivery()

    response = api_client.post(GUEST_CHECKOUT_URL, _minimal_payload(variant), format="json")

    assert response.status_code == 201, response.data
    order = SalesOrder.objects.select_related("shipping_address").get(
        id=response.data["data"]["id"]
    )
    address = order.shipping_address
    assert address.full_name == "Rahim Uddin"
    assert address.phone == "+8801711111111"
    assert address.city == "Dhaka"
    assert address.postal_code == ""


def test_guest_checkout_requires_district_city(api_client):
    variant = _stocked_variant()
    _dhaka_delivery()
    payload = _minimal_payload(variant)
    del payload["shipping_address"]["city"]

    response = api_client.post(GUEST_CHECKOUT_URL, payload, format="json")

    assert response.status_code == 400
    assert not SalesOrder.objects.exists()


@pytest.mark.parametrize(
    ("city", "expected_charge"),
    [("Dhaka", Decimal("70.00")), ("Chattogram", Decimal("110.00"))],
)
def test_guest_checkout_adds_delivery_charge_for_the_district(api_client, city, expected_charge):
    variant = _stocked_variant()
    _dhaka_delivery()

    response = api_client.post(
        GUEST_CHECKOUT_URL, _minimal_payload(variant, city=city), format="json"
    )

    assert response.status_code == 201, response.data
    data = response.data["data"]
    assert Decimal(data["shipping_total"]) == expected_charge
    assert Decimal(data["grand_total"]) == (
        Decimal(data["subtotal"])
        + Decimal(data["tax_total"])
        + expected_charge
        - Decimal(data["discount_total"])
    )


def test_shipping_quote_previews_the_district_delivery_charge(api_client):
    variant = _stocked_variant()
    _dhaka_delivery()
    items = [{"variant_id": str(variant.id), "quantity": 1}]

    inside = api_client.post(
        SHIPPING_QUOTE_URL, {"items": items, "address_text": "Dhaka"}, format="json"
    )
    outside = api_client.post(
        SHIPPING_QUOTE_URL, {"items": items, "address_text": "Sylhet"}, format="json"
    )

    assert inside.data["data"]["shipping_total"] == "70.00"
    assert outside.data["data"]["shipping_total"] == "110.00"


@pytest.mark.parametrize(
    "path",
    [
        ("first_name",),
        ("phone",),
        ("items",),
        ("payment_method",),
        ("shipping_address",),
        ("shipping_address", "line1"),
        ("shipping_address", "city"),
    ],
)
def test_guest_checkout_rejects_a_missing_required_field(api_client, path):
    variant = _stocked_variant()
    _dhaka_delivery()
    payload = _minimal_payload(variant)
    target = payload
    for key in path[:-1]:
        target = target[key]
    del target[path[-1]]

    response = api_client.post(GUEST_CHECKOUT_URL, payload, format="json")

    assert response.status_code == 400
    assert not SalesOrder.objects.exists()


def test_guest_checkout_rejects_an_empty_item_list(api_client):
    _dhaka_delivery()
    payload = _minimal_payload(_stocked_variant())
    payload["items"] = []

    response = api_client.post(GUEST_CHECKOUT_URL, payload, format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "empty_order"
    assert not SalesOrder.objects.exists()


def test_guest_checkout_accepts_optional_coupon_and_note(api_client):
    variant = _stocked_variant()
    _dhaka_delivery()
    CouponFactory(code="SAVE10", discount_type="fixed", value=Decimal("10.00"))
    payload = _minimal_payload(variant)
    payload.update(coupon_code="SAVE10", notes="Call before delivery")

    response = api_client.post(GUEST_CHECKOUT_URL, payload, format="json")

    assert response.status_code == 201, response.data
    assert response.data["data"]["coupon_code"] == "SAVE10"
    assert Decimal(response.data["data"]["discount_total"]) == Decimal("10.00")
    order = SalesOrder.objects.get(id=response.data["data"]["id"])
    assert order.notes == "Call before delivery"


def test_guest_checkout_without_any_shipping_zone_is_refused_not_free(api_client):
    variant = _stocked_variant()

    response = api_client.post(GUEST_CHECKOUT_URL, _minimal_payload(variant), format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "no_shipping_zone"
    assert not SalesOrder.objects.exists()


def test_guest_checkout_without_a_rate_for_the_zone_is_refused_not_free(api_client):
    variant = _stocked_variant()
    # Outside Dhaka exists as the catch-all zone, but no carrier has a rate for it.
    ShippingZoneFactory(country_codes=[])
    CarrierFactory()

    response = api_client.post(
        GUEST_CHECKOUT_URL, _minimal_payload(variant, city="Rajshahi"), format="json"
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "no_shipping_rate"
    assert not SalesOrder.objects.exists()


def _queries_on(captured, table: str) -> int:
    return sum(
        1 for q in captured if q["sql"].startswith("SELECT") and f'FROM "{table}"' in q["sql"]
    )


def test_guest_checkout_loads_variants_and_tax_once_regardless_of_item_count(api_client):
    _dhaka_delivery()

    def checkout_with(count: int, email: str):
        payload = _minimal_payload(_stocked_variant())
        payload["email"] = email
        payload["items"] = [
            {"variant_id": str(_stocked_variant().id), "quantity": 1} for _ in range(count)
        ]
        with CaptureQueriesContext(connection) as captured:
            response = api_client.post(GUEST_CHECKOUT_URL, payload, format="json")
        assert response.status_code == 201, response.data
        return captured

    one = checkout_with(1, "scaling-one@example.com")
    many = checkout_with(6, "scaling-many@example.com")

    for table in ("catalog_productvariant", "catalog_product", "accounting_taxrate"):
        assert _queries_on(many, table) == _queries_on(one, table), table


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


def test_guest_checkout_combines_duplicate_variants_before_preorder_limit_check(api_client):
    """Two line entries for the same pre-order variant must be validated
    against their combined quantity, not checked independently — otherwise a
    payload split into fragments could slip a total past the configured
    preorder_stock_limit."""
    now = timezone.now()
    variant = ProductVariantFactory(
        is_preorder_enabled=True,
        preorder_start_date=now - timedelta(days=1),
        preorder_end_date=now + timedelta(days=1),
        preorder_stock_limit=5,
    )
    _configured_delivery()

    payload = _guest_payload(
        variant,
        items=[
            {"variant_id": str(variant.id), "quantity": 3},
            {"variant_id": str(variant.id), "quantity": 3},
        ],
    )
    response = api_client.post(GUEST_CHECKOUT_URL, payload, format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "preorder_stock_exceeded"
    assert variant._get_preordered_quantity() == 0


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
    ShippingRateFactory(
        zone=zone, carrier=carrier, base_weight=Decimal("50"), base_charge=Decimal("15.00")
    )

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


def _account_state(user):
    """Everything an anonymous checkout must never change on an account."""
    user.refresh_from_db()
    addresses = sorted((str(a.id), a.is_default) for a in Address.objects.filter(user=user))
    return (user.email, user.phone, user.is_phone_verified, addresses)


def _order_customer_id(response):
    assert response.status_code == 201, response.data
    return SalesOrder.objects.get(id=response.data["data"]["id"]).customer_id


def test_anonymous_checkout_creates_a_guest_identity_not_an_account(api_client):
    _dhaka_delivery()

    response = api_client.post(
        GUEST_CHECKOUT_URL, _minimal_payload(_stocked_variant()), format="json"
    )

    assert response.status_code == 201, response.data
    order = SalesOrder.objects.select_related("customer").get(id=response.data["data"]["id"])
    guest = order.customer
    assert guest.is_guest
    assert guest.email is None
    assert guest.phone == "01711111111"
    assert not guest.has_usable_password()
    # The typed contact details live on the order.
    assert order.contact_phone == "+8801711111111"
    assert order.contact_email == ""


def test_repeat_guest_checkouts_reuse_one_identity_per_phone(api_client):
    _dhaka_delivery()
    first = _minimal_payload(_stocked_variant())
    again = _minimal_payload(_stocked_variant())
    again["phone"] = "01711111111"  # same number, local form
    other = _minimal_payload(_stocked_variant())
    other["phone"] = "01822222222"

    customers = [
        _order_customer_id(api_client.post(GUEST_CHECKOUT_URL, payload, format="json"))
        for payload in (first, again, other)
    ]

    assert customers[0] == customers[1]
    assert customers[2] != customers[0]
    assert User.objects.filter(is_guest=True).count() == 2


@pytest.mark.parametrize("phone_verified", [False, True])
def test_anonymous_checkout_with_a_customers_phone_leaves_their_account_alone(
    api_client, phone_verified
):
    _dhaka_delivery()
    customer = CustomerUserFactory(
        email="known@example.com", phone="+8801733333333", is_phone_verified=phone_verified
    )
    AddressFactory(user=customer, is_default=True)
    before = _account_state(customer)
    payload = _minimal_payload(_stocked_variant())
    payload["phone"] = "01733333333"

    customer_id = _order_customer_id(api_client.post(GUEST_CHECKOUT_URL, payload, format="json"))

    assert customer_id != customer.id
    assert not SalesOrder.objects.filter(customer=customer).exists()
    assert _account_state(customer) == before


def test_anonymous_checkout_with_a_customers_email_leaves_their_account_alone(api_client):
    _dhaka_delivery()
    customer = CustomerUserFactory(email="has-email@example.com", phone="")
    AddressFactory(user=customer, is_default=True)
    before = _account_state(customer)
    payload = _minimal_payload(_stocked_variant())
    payload["email"] = "has-email@example.com"

    response = api_client.post(GUEST_CHECKOUT_URL, payload, format="json")

    assert _order_customer_id(response) != customer.id
    assert _account_state(customer) == before  # phone not filled in, address book untouched
    order = SalesOrder.objects.get(id=response.data["data"]["id"])
    assert order.contact_email == "has-email@example.com"


def test_anonymous_checkout_never_attaches_to_a_staff_account(api_client):
    _dhaka_delivery()
    staff = StaffUserFactory(phone="01744444444")
    payload = _minimal_payload(_stocked_variant())
    payload["phone"] = "01744444444"

    customer_id = _order_customer_id(api_client.post(GUEST_CHECKOUT_URL, payload, format="json"))

    assert customer_id != staff.id


def test_authenticated_checkout_belongs_to_the_signed_in_customer(api_client):
    _dhaka_delivery()
    customer = CustomerUserFactory(email="signed-in@example.com", phone="01755555555")
    default = AddressFactory(user=customer, is_default=True)
    api_client.force_authenticate(user=customer)
    payload = _minimal_payload(_stocked_variant())
    payload["phone"] = "01799999999"  # a different contact number for this delivery

    response = api_client.post(GUEST_CHECKOUT_URL, payload, format="json")

    assert _order_customer_id(response) == customer.id
    customer.refresh_from_db()
    assert customer.phone == "01755555555"
    default.refresh_from_db()
    assert default.is_default  # the new delivery address didn't take over
    assert not User.objects.filter(is_guest=True).exists()


def test_anonymous_checkout_needs_a_valid_mobile_number(api_client):
    _dhaka_delivery()
    payload = _minimal_payload(_stocked_variant())
    payload["phone"] = "12345"

    response = api_client.post(GUEST_CHECKOUT_URL, payload, format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "invalid_phone"
    assert not SalesOrder.objects.exists()
    assert not User.objects.filter(is_guest=True).exists()


def test_database_allows_only_one_live_guest_per_phone():
    get_or_create_guest_customer(phone="01766666666")
    duplicate = User(email=None, phone="01766666666", is_guest=True)

    with pytest.raises(IntegrityError), transaction.atomic():
        duplicate.save()


def test_concurrent_first_checkout_reuses_the_winners_guest_identity(monkeypatch):
    """Two first checkouts for one number: the other request's insert commits
    between our lookup and our insert. Ours must hit the unique constraint
    and fall back to the winner's row, not create a second identity."""
    real_set_unusable_password = User.set_unusable_password
    winner = User(email=None, phone="01777777777", is_guest=True)

    def other_request_commits_first(self):
        # Runs after our lookup missed and before our insert's savepoint.
        real_set_unusable_password(self)
        if winner._state.adding:
            winner.save()

    monkeypatch.setattr(User, "set_unusable_password", other_request_commits_first)

    guest = get_or_create_guest_customer(phone="+8801777777777")

    assert guest.pk == winner.pk
    assert User.objects.filter(is_guest=True, phone="01777777777").count() == 1


def test_phone_only_customer_renders_as_text_and_in_django_admin(api_client, client):
    _dhaka_delivery()
    response = api_client.post(
        GUEST_CHECKOUT_URL, _minimal_payload(_stocked_variant()), format="json"
    )
    customer = SalesOrder.objects.get(id=response.data["data"]["id"]).customer

    # AbstractBaseUser.__str__ returns the email; it must not crash on None.
    assert str(customer) == "01711111111"
    client.force_login(User.objects.create_superuser(email="su-admin@example.com", password="x"))
    assert client.get("/admin/accounts/user/").status_code == 200
    assert client.get(f"/admin/accounts/user/{customer.id}/change/").status_code == 200


def test_admin_can_find_a_phone_only_order_by_phone(api_client):
    _dhaka_delivery()
    response = api_client.post(
        GUEST_CHECKOUT_URL, _minimal_payload(_stocked_variant()), format="json"
    )
    order_id = response.data["data"]["id"]
    api_client.force_authenticate(user=AdminUserFactory())

    for term in ("01711111111", "+8801711111111"):
        found = api_client.get("/api/v1/admin/orders/", {"search": term})
        assert [row["id"] for row in found.data["data"]["results"]] == [order_id], term
