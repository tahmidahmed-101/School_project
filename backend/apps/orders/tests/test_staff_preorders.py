"""A pre-order keyed in by staff is the same order a shopper would have placed:
same price, limit, window, delivery charge and deposit-first payment.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounts.constants import UserRole
from apps.accounts.factories import AddressFactory, CustomerUserFactory
from apps.accounts.tests.helpers import create_user
from apps.common.exceptions import BusinessRuleViolationError
from apps.orders.constants import PaymentMethodKey
from apps.orders.factories import CouponFactory
from apps.orders.models import Payment, SalesOrder, StockReservation
from apps.orders.selectors.payments import order_balance_due, order_deposit_due
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.orders import add_order_line, update_order_line
from apps.orders.services.payments import capture_payment, record_payment_due
from apps.orders.services.staff_orders import place_staff_order, quote_staff_order

from .test_api import _stocked_variant
from .test_preorder_flow import _set_deposit
from .test_public_checkout_api import _configured_delivery
from .test_unpaid_orders import _preorder_variant

pytestmark = pytest.mark.django_db

ORDERS_URL = "/api/v1/admin/orders/"
PREORDER = SalesOrder.OrderType.PREORDER


def _windowed_variant(start_days: int, end_days: int):
    now = timezone.now()
    variant = _preorder_variant()
    variant.preorder_start_date = now + timedelta(days=start_days)
    variant.preorder_end_date = now + timedelta(days=end_days)
    variant.save(update_fields=["preorder_start_date", "preorder_end_date"])
    return variant


def _address(customer):
    return AddressFactory(user=customer, city="Dhaka", country="Bangladesh")


def _staff_preorder(variant, quantity=2, **kwargs):
    customer = kwargs.pop("customer", None) or CustomerUserFactory()
    return place_staff_order(
        customer=customer, lines=[(variant, quantity)], kind=PREORDER, **kwargs
    )


def _admin(api_client, email):
    api_client.force_authenticate(user=create_user(email=email, role=UserRole.ADMIN))
    return api_client


def test_staff_preorder_equals_the_one_a_customer_places():
    _set_deposit("30")
    _zone, carrier = _configured_delivery(kind="preorder")
    variant = _preorder_variant(limit=None, price=Decimal("1000.00"))

    shopper = CustomerUserFactory()
    cart = get_or_create_cart(shopper)
    add_line(order=cart, variant=variant, quantity=2)
    checkout(order=cart, shipping_address=_address(shopper), carrier=carrier)
    record_payment_due(order=cart, method=PaymentMethodKey.COD)
    cart.refresh_from_db()

    customer = CustomerUserFactory()
    order = _staff_preorder(
        variant,
        customer=customer,
        shipping_address=_address(customer),
        carrier=carrier,
        payment_method=PaymentMethodKey.COD,
    )

    assert order.order_type == cart.order_type == PREORDER
    assert order.status == cart.status == SalesOrder.Status.AWAITING_PAYMENT
    assert order.preorder_stage == cart.preorder_stage
    for field in ("subtotal", "tax_total", "shipping_total", "discount_total", "grand_total"):
        assert getattr(order, field) == getattr(cart, field), field
    assert order.shipping_total == Decimal("60.00")
    assert order_deposit_due(order) == order_deposit_due(cart) == Decimal("618.00")
    assert order.coupon_id is None
    assert order.lines.get().is_preorder is True
    assert not StockReservation.objects.filter(order_line__order=order).exists()
    payment = order.payments.get()
    assert payment.status == Payment.Status.PENDING
    assert payment.amount == order.grand_total


def test_staff_preorder_is_never_paid_at_creation_whatever_was_asked():
    _set_deposit("30")
    order = _staff_preorder(
        _preorder_variant(price=Decimal("1000.00")),
        payment_method=PaymentMethodKey.CASH,
        capture=True,
    )

    assert order.status == SalesOrder.Status.AWAITING_PAYMENT
    assert order_balance_due(order) == order.grand_total
    assert not order.payments.filter(status=Payment.Status.CAPTURED).exists()


def test_recording_the_deposit_confirms_a_staff_preorder():
    _set_deposit("30")
    order = _staff_preorder(_preorder_variant(price=Decimal("1000.00")))

    capture_payment(order=order, amount=Decimal("10.00"), method=PaymentMethodKey.CASH)
    order.refresh_from_db()
    assert order.status == SalesOrder.Status.AWAITING_PAYMENT

    capture_payment(
        order=order,
        amount=order_deposit_due(order) - Decimal("10.00"),
        method=PaymentMethodKey.CASH,
    )
    order.refresh_from_db()
    assert order.status == SalesOrder.Status.CONFIRMED
    assert order_balance_due(order) == order.grand_total - order_deposit_due(order)


@pytest.mark.parametrize(
    ("method", "expected"),
    [
        (PaymentMethodKey.COD, SalesOrder.Status.CONFIRMED),
        (PaymentMethodKey.MANUAL, SalesOrder.Status.AWAITING_PAYMENT),
    ],
)
def test_zero_deposit_follows_the_customer_path(method, expected):
    _set_deposit("0")
    variant = _preorder_variant(limit=None)

    cart = get_or_create_cart(CustomerUserFactory())
    add_line(order=cart, variant=variant, quantity=1)
    checkout(order=cart)
    record_payment_due(order=cart, method=method)
    cart.refresh_from_db()

    order = _staff_preorder(variant, quantity=1, payment_method=method)

    assert order.status == cart.status == expected
    assert not order.payments.filter(status=Payment.Status.CAPTURED).exists()


def test_staff_preorder_refuses_mixed_lines():
    customer = CustomerUserFactory()

    with pytest.raises(BusinessRuleViolationError) as excinfo:
        place_staff_order(
            customer=customer,
            lines=[(_preorder_variant(), 1), (_stocked_variant(), 1)],
            kind=PREORDER,
        )

    assert excinfo.value.code == "order_kind_mismatch"
    assert not SalesOrder.objects.filter(customer=customer).exists()


@pytest.mark.parametrize(
    ("window", "code"),
    [
        ((-10, -1), "preorder_closed"),
        ((1, 10), "preorder_not_active"),
    ],
)
def test_staff_preorder_refuses_an_item_outside_its_window(window, code):
    variant = _windowed_variant(*window)
    customer = CustomerUserFactory()

    with pytest.raises(BusinessRuleViolationError) as excinfo:
        _staff_preorder(variant, customer=customer)

    assert excinfo.value.code == code
    assert not SalesOrder.objects.filter(customer=customer).exists()


def test_staff_preorder_keeps_the_preorder_limit():
    variant = _preorder_variant(limit=3)
    _staff_preorder(variant, quantity=2)

    with pytest.raises(BusinessRuleViolationError) as excinfo:
        _staff_preorder(variant, quantity=2)

    assert excinfo.value.code == "preorder_stock_exceeded"


def test_staff_preorder_takes_no_coupon_and_no_discount():
    variant = _preorder_variant()

    with pytest.raises(BusinessRuleViolationError) as coupon:
        _staff_preorder(variant, coupon_code="SAVE10")
    with pytest.raises(BusinessRuleViolationError) as discount:
        _staff_preorder(variant, discount=Decimal("50.00"))

    assert coupon.value.code == "coupon_stock_only"
    assert discount.value.code == "discount_stock_only"
    assert not SalesOrder.objects.exists()


def test_a_staff_stock_order_is_unchanged():
    variant = _stocked_variant()
    customer = CustomerUserFactory()

    paid = place_staff_order(
        customer=customer, lines=[(variant, 2)], payment_method=PaymentMethodKey.CASH
    )
    cod = place_staff_order(
        customer=customer, lines=[(variant, 1)], payment_method=PaymentMethodKey.COD
    )
    unpaid = place_staff_order(customer=customer, lines=[(variant, 1)], capture=False)

    assert paid.order_type == SalesOrder.OrderType.STOCK
    assert paid.status == SalesOrder.Status.CONFIRMED
    assert order_balance_due(paid) == Decimal("0.00")
    assert StockReservation.objects.filter(order_line__order=paid).count() == 1
    assert cod.status == SalesOrder.Status.CONFIRMED
    assert cod.payments.get().status == Payment.Status.PENDING
    assert unpaid.status == SalesOrder.Status.AWAITING_PAYMENT
    assert not unpaid.payments.exists()


def test_a_staff_stock_order_still_refuses_a_preorder_item():
    with pytest.raises(BusinessRuleViolationError) as excinfo:
        place_staff_order(customer=CustomerUserFactory(), lines=[(_preorder_variant(), 1)])

    assert excinfo.value.code == "order_kind_mismatch"


def test_adding_a_line_to_a_staff_preorder_keeps_the_rules():
    order = _staff_preorder(_preorder_variant(limit=None))
    closed = _windowed_variant(-10, -1)

    with pytest.raises(BusinessRuleViolationError) as stock:
        add_order_line(order=order, variant=_stocked_variant(), quantity=1)
    with pytest.raises(BusinessRuleViolationError) as shut:
        add_order_line(order=order, variant=closed, quantity=1)
    with pytest.raises(BusinessRuleViolationError) as over:
        add_order_line(order=order, variant=_preorder_variant(limit=1), quantity=2)
    line = add_order_line(order=order, variant=_preorder_variant(limit=5), quantity=2)

    assert stock.value.code == "order_kind_mismatch"
    assert shut.value.code == "preorder_closed"
    assert over.value.code == "preorder_stock_exceeded"
    assert line.is_preorder is True
    assert not StockReservation.objects.filter(order_line__order=order).exists()


def test_a_preorder_line_cannot_grow_once_its_window_has_closed():
    variant = _preorder_variant(limit=None)
    order = _staff_preorder(variant, quantity=2)
    line = order.lines.get()
    variant.preorder_end_date = timezone.now() - timedelta(hours=1)
    variant.save(update_fields=["preorder_end_date"])

    with pytest.raises(BusinessRuleViolationError) as excinfo:
        update_order_line(line=line, quantity=3)
    update_order_line(line=line, quantity=1)

    assert excinfo.value.code == "preorder_closed"
    line.refresh_from_db()
    assert line.quantity == 1


def test_quote_matches_the_order_and_leaves_nothing_behind():
    _set_deposit("30")
    _zone, carrier = _configured_delivery(kind="preorder")
    variant = _preorder_variant(limit=2, price=Decimal("1000.00"))
    customer = CustomerUserFactory()
    address = _address(customer)

    quote = quote_staff_order(
        lines=[(variant, 2)], kind=PREORDER, shipping_address=address, carrier=carrier
    )

    assert not SalesOrder.objects.exists()
    order = _staff_preorder(variant, customer=customer, shipping_address=address, carrier=carrier)
    assert quote["grand_total"] == order.grand_total
    assert quote["shipping_total"] == order.shipping_total
    assert quote["deposit_due"] == order_deposit_due(order)


def test_endpoint_creates_a_preorder_awaiting_its_deposit(api_client):
    _set_deposit("30")
    client = _admin(api_client, "staff-preorder@example.com")
    customer = CustomerUserFactory()
    variant = _preorder_variant(price=Decimal("1000.00"))

    response = client.post(
        ORDERS_URL,
        {
            "customer_id": str(customer.id),
            "order_type": "preorder",
            "payment_method": "cash",
            "capture_payment": True,
            "lines": [{"variant_id": str(variant.id), "quantity": 1}],
        },
        format="json",
    )

    assert response.status_code == 201, response.data
    data = response.data["data"]
    assert data["order_type"] == "preorder"
    assert data["status"] == "awaiting_payment"
    assert data["paid_total"] in ("0.00", Decimal("0.00"))
    assert Decimal(str(data["deposit_due"])) == Decimal("300.00")

    captured = client.post(
        f"{ORDERS_URL}{data['id']}/capture-payment/",
        {"amount": "300.00", "method": "cash"},
        format="json",
    )
    assert captured.status_code == 200, captured.data
    assert captured.data["data"]["status"] == "confirmed"


def test_endpoint_refuses_a_coupon_and_a_stock_item_on_a_preorder(api_client):
    client = _admin(api_client, "staff-preorder-refuse@example.com")
    customer = CustomerUserFactory()
    body = {
        "customer_id": str(customer.id),
        "order_type": "preorder",
        "lines": [{"variant_id": str(_preorder_variant().id), "quantity": 1}],
    }

    coupon = client.post(ORDERS_URL, {**body, "coupon_code": "SAVE10"}, format="json")
    discount = client.post(ORDERS_URL, {**body, "discount_total": "20.00"}, format="json")
    mixed = client.post(
        ORDERS_URL,
        {
            **body,
            "lines": [*body["lines"], {"variant_id": str(_stocked_variant().id), "quantity": 1}],
        },
        format="json",
    )

    assert coupon.status_code == 400 and "coupon_stock_only" in str(coupon.data)
    assert discount.status_code == 400 and "discount_stock_only" in str(discount.data)
    assert mixed.status_code == 400 and "order_kind_mismatch" in str(mixed.data)
    assert not SalesOrder.objects.filter(customer=customer).exists()


def test_quote_endpoint_returns_the_deposit(api_client):
    _set_deposit("25")
    client = _admin(api_client, "staff-preorder-quote@example.com")
    variant = _preorder_variant(price=Decimal("400.00"))

    response = client.post(
        f"{ORDERS_URL}quote/",
        {"order_type": "preorder", "lines": [{"variant_id": str(variant.id), "quantity": 2}]},
        format="json",
    )

    assert response.status_code == 200, response.data
    assert response.data["data"]["grand_total"] == "800.00"
    assert response.data["data"]["deposit_due"] == "200.00"
    assert not SalesOrder.objects.exists()


def test_a_staff_stock_order_takes_a_coupon_and_refuses_a_typed_discount():
    variant = _stocked_variant()
    customer = CustomerUserFactory()
    coupon = CouponFactory(code="STAFF10", discount_type="percentage", value=Decimal("10.00"))

    order = place_staff_order(
        customer=customer, lines=[(variant, 2)], coupon_code="staff10", capture=False
    )

    assert order.coupon_id == coupon.id
    assert order.discount_total == (order.subtotal * Decimal("0.10")).quantize(Decimal("0.01"))
    assert order.grand_total < order.subtotal + order.tax_total + order.shipping_total
    with pytest.raises(BusinessRuleViolationError) as error:
        place_staff_order(customer=customer, lines=[(variant, 1)], discount=Decimal("50.00"))
    assert error.value.code == "manual_discount_unsupported"
