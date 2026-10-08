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
from apps.catalog.models import Category
from apps.common.exceptions import BusinessRuleViolationError
from apps.orders.factories import (
    CouponFactory,
    PaymentFactory,
    SalesOrderFactory,
    SalesOrderLineFactory,
    StockReservationFactory,
)
from apps.orders.models import Payment, PreorderStage, SalesOrder
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.invoice_document import build_invoice_context
from apps.orders.services.notifications import order_label
from apps.orders.services.orders import add_order_line

pytestmark = pytest.mark.django_db

BASE = "/api/v1/admin/orders/"
STOCK = SalesOrder.OrderType.STOCK
PREORDER = SalesOrder.OrderType.PREORDER


@pytest.fixture
def admin_client(api_client):
    api_client.force_authenticate(
        user=create_user(email="separation-admin@example.com", role=UserRole.ADMIN)
    )
    return api_client


def _stock_variant():
    return ProductVariantFactory(price=Decimal("100.00"))


def _preorder_variant(*, opens_in_days=-1, closes_in_days=10, **fields):
    now = timezone.now()
    return ProductVariantFactory(
        product__category__category_type=Category.CategoryType.PREORDER,
        price=Decimal("100.00"),
        is_preorder_enabled=True,
        preorder_start_date=now + timedelta(days=opens_in_days),
        preorder_end_date=now + timedelta(days=closes_in_days),
        **fields,
    )


def _closed_preorder_variant():
    return _preorder_variant(opens_in_days=-30, closes_in_days=-1)


def _cart(variant):
    cart = get_or_create_cart(CustomerUserFactory())
    add_line(order=cart, variant=variant, quantity=1)
    return cart


def test_a_closed_preorder_cannot_be_added_to_a_cart():
    cart = get_or_create_cart(CustomerUserFactory())

    with pytest.raises(BusinessRuleViolationError) as exc:
        add_line(order=cart, variant=_closed_preorder_variant(), quantity=1)

    assert exc.value.code == "preorder_closed"
    assert not cart.lines.exists()


def test_a_cart_line_whose_window_closed_cannot_be_checked_out():
    variant = _preorder_variant()
    cart = _cart(variant)
    variant.preorder_end_date = timezone.now() - timedelta(hours=1)
    variant.save(update_fields=["preorder_end_date"])

    with pytest.raises(BusinessRuleViolationError) as exc:
        checkout(order=cart)

    assert exc.value.code == "preorder_closed"
    cart.refresh_from_db()
    assert cart.status == SalesOrder.Status.PENDING


def test_staff_cannot_add_a_closed_preorder_to_an_order():
    order = SalesOrderFactory(status=SalesOrder.Status.CONFIRMED, order_type=PREORDER)

    with pytest.raises(BusinessRuleViolationError) as exc:
        add_order_line(order=order, variant=_closed_preorder_variant(), quantity=1)

    assert exc.value.code == "preorder_closed"


def test_a_stock_variant_with_leftover_preorder_dates_is_a_stock_line():
    now = timezone.now()
    variant = ProductVariantFactory(
        price=Decimal("100.00"),
        is_preorder_enabled=True,
        preorder_price=Decimal("80.00"),
        preorder_start_date=now - timedelta(days=1),
        preorder_end_date=now + timedelta(days=5),
    )

    line = add_line(order=get_or_create_cart(CustomerUserFactory()), variant=variant, quantity=1)

    assert line.is_preorder is False
    assert line.unit_price == Decimal("100.00")


def test_mixed_basket_reads_the_category_not_the_stored_line_flag():
    cart = get_or_create_cart(CustomerUserFactory())
    SalesOrderLineFactory(order=cart, variant=_preorder_variant(), is_preorder=False)

    with pytest.raises(BusinessRuleViolationError) as exc:
        add_line(order=cart, variant=_stock_variant(), quantity=1)

    assert exc.value.code == "mixed_basket"


def test_guest_checkout_refuses_a_closed_preorder(api_client):
    response = api_client.post(
        "/api/v1/public/checkout/",
        {
            "phone": "01712345678",
            "first_name": "Guest",
            "payment_method": "cod",
            "shipping_address": {"line1": "House 1", "city": "Dhaka"},
            "items": [{"variant_id": str(_closed_preorder_variant().id), "quantity": 1}],
        },
        format="json",
    )

    assert response.status_code == 400, response.data
    assert response.data["error"]["code"] == "preorder_closed"
    assert not SalesOrder.objects.exists()


def test_coupon_preview_refuses_a_basket_holding_a_preorder(api_client):
    coupon = CouponFactory()
    payload = {
        "code": coupon.code,
        "items": [{"variant_id": str(_preorder_variant().id), "quantity": 1}],
    }

    response = api_client.post("/api/v1/public/checkout/coupon/", payload, format="json")

    assert response.status_code == 400, response.data
    assert response.data["error"]["code"] == "coupon_stock_only"


def test_coupon_preview_still_accepts_a_stock_basket(api_client):
    coupon = CouponFactory()
    payload = {
        "code": coupon.code,
        "items": [{"variant_id": str(_stock_variant().id), "quantity": 1}],
    }

    response = api_client.post("/api/v1/public/checkout/coupon/", payload, format="json")

    assert response.status_code == 200, response.data


def _order_ids(client, **params):
    response = client.get(BASE, params)
    assert response.status_code == 200, response.data
    return {row["id"] for row in response.data["data"]["results"]}


def test_orders_list_types_an_open_cart_by_its_lines(admin_client):
    stock_cart = _cart(_stock_variant())
    preorder_cart = _cart(_preorder_variant())
    placed_stock = SalesOrderFactory(status=SalesOrder.Status.CONFIRMED, order_type=STOCK)
    placed_preorder = SalesOrderFactory(status=SalesOrder.Status.CONFIRMED, order_type=PREORDER)

    stock_ids = _order_ids(admin_client, order_type="stock")
    preorder_ids = _order_ids(admin_client, order_type="preorder")

    assert stock_ids == {str(stock_cart.id), str(placed_stock.id)}
    assert preorder_ids == {str(preorder_cart.id), str(placed_preorder.id)}


def test_orders_export_types_an_open_cart_by_its_lines(admin_client):
    stock_cart = _cart(_stock_variant())
    preorder_cart = _cart(_preorder_variant())

    response = admin_client.get(f"{BASE}export/", {"order_type": "stock"})

    assert response.status_code == 200
    body = response.content.decode()
    assert stock_cart.order_number in body
    assert preorder_cart.order_number not in body


def test_an_open_cart_row_says_which_half_it_belongs_to(admin_client):
    preorder_cart = _cart(_preorder_variant())

    response = admin_client.get(f"{BASE}{preorder_cart.id}/")

    assert response.data["data"]["order_type"] == PREORDER


def test_a_preorder_order_row_carries_no_coupon(admin_client):
    order = SalesOrderFactory(
        status=SalesOrder.Status.CONFIRMED, order_type=PREORDER, coupon=CouponFactory()
    )

    data = admin_client.get(f"{BASE}{order.id}/").data["data"]

    assert data["coupon_code"] is None
    assert data["deposit_due"] is not None


def test_a_stock_order_row_carries_no_stage_or_deposit(admin_client):
    order = SalesOrderFactory(
        status=SalesOrder.Status.CONFIRMED,
        order_type=STOCK,
        preorder_stage=PreorderStage.values[0],
        coupon=CouponFactory(),
    )

    data = admin_client.get(f"{BASE}{order.id}/").data["data"]

    assert data["preorder_stage"] == ""
    assert data["preorder_stage_events"] == []
    assert data["deposit_due"] is None
    assert data["coupon_code"] == order.coupon.code


def test_reservation_rows_carry_order_type(admin_client):
    order = SalesOrderFactory(status=SalesOrder.Status.CONFIRMED, order_type=PREORDER)
    StockReservationFactory(order_line=SalesOrderLineFactory(order=order))

    response = admin_client.get(f"{BASE}reservations/")

    assert response.status_code == 200, response.data
    assert [row["order_type"] for row in response.data["data"]["results"]] == [PREORDER]


def _placed(kind, **fields):
    order = SalesOrderFactory(
        status=SalesOrder.Status.CONFIRMED,
        order_type=kind,
        subtotal=Decimal("1000.00"),
        grand_total=Decimal("1000.00"),
        **fields,
    )
    SalesOrderLineFactory(order=order, quantity=1, unit_price=Decimal("1000.00"))
    return order


def test_preorder_invoice_shows_stage_deposit_and_balance():
    profile = get_business_profile()
    profile.preorder_deposit_percent = Decimal("30.00")
    profile.save(update_fields=["preorder_deposit_percent"])
    stage = PreorderStage.values[0]
    order = _placed(PREORDER, preorder_stage=stage)
    PaymentFactory(order=order, amount=Decimal("300.00"), status=Payment.Status.CAPTURED)

    context = build_invoice_context(order)

    assert context["doc_title"] == "Pre-order invoice"
    assert context["is_preorder"] is True
    assert {"label": "Stage", "value": PreorderStage(stage).label} in context["doc_meta"]
    assert "Status" not in [item["label"] for item in context["doc_meta"]]
    assert context["deposit_due"] == Decimal("300.00")
    assert context["paid_label"] == "Deposit paid"
    assert context["paid"] == Decimal("300.00")
    assert context["balance"] == Decimal("700.00")


def test_stock_invoice_says_nothing_about_preorder():
    order = _placed(STOCK)

    context = build_invoice_context(order)

    assert context["doc_title"] == "Invoice"
    assert context["is_preorder"] is False
    assert context["deposit_due"] is None
    assert [item["label"] for item in context["doc_meta"]] == ["Issued", "Status"]


def test_preorder_invoice_pdf_renders(admin_client):
    order = _placed(PREORDER)

    response = admin_client.get(f"{BASE}{order.id}/invoice/")

    assert response.status_code == 200
    assert response.content.startswith(b"%PDF")


def test_notifications_name_a_preorder_as_a_preorder():
    assert order_label(_placed(PREORDER)).startswith("Pre-order ")
    assert order_label(_placed(STOCK)).startswith("Order ")
