from __future__ import annotations

from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.factories import AddressFactory, CustomerUserFactory
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductImageFactory, ProductVariantFactory
from apps.inventory.constants import MovementType
from apps.inventory.selectors.stock import get_stock_item
from apps.inventory.services.stock import record_movement
from apps.logistics.factories import CarrierFactory
from apps.orders.factories import (
    PaymentFactory,
    SalesOrderFactory,
    SalesOrderLineFactory,
    StockReservationFactory,
)
from apps.orders.models import Payment, SalesOrder, StockReservation
from apps.orders.services.carts import add_line, get_or_create_cart

pytestmark = pytest.mark.django_db


def _stocked_variant(quantity: int = 10):
    variant = ProductVariantFactory()
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=quantity,
        unit_cost=Decimal("5.00"),
    )
    return variant


def _reserved_order(customer_email: str, quantity: int = 3):
    from apps.orders.services.checkout import checkout

    customer = create_user(email=customer_email)
    variant = _stocked_variant(quantity=10)
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=quantity)
    checkout(order=cart)
    cart.refresh_from_db()
    return cart, variant


def test_customer_can_add_to_cart_and_checkout_but_not_mark_it_paid(api_client):
    customer = create_user(email="order-customer@example.com")
    api_client.force_authenticate(user=customer)
    variant = _stocked_variant()

    response = api_client.post(
        "/api/v1/customer/orders/cart/lines/",
        {
            "variant_id": str(variant.id),
            "quantity": 3,
        },
    )
    assert response.status_code == 201
    assert response.data["data"]["grand_total"] == "59.97"

    response = api_client.post("/api/v1/customer/orders/cart/checkout/")
    assert response.status_code == 200

    assert response.data["data"]["status"] == "awaiting_payment"

    # A customer cannot mark their own order paid: staff capture it.
    response = api_client.post(
        "/api/v1/customer/orders/cart/payment/",
        {"amount": "59.97", "method": "card", "reference": "TRX-CARD-0001"},
    )
    assert response.status_code == 404


def test_customer_cannot_supply_own_unit_price(api_client):
    customer = create_user(email="order-price-tamper@example.com")
    api_client.force_authenticate(user=customer)
    variant = _stocked_variant()
    assert variant.price == Decimal("19.99")

    response = api_client.post(
        "/api/v1/customer/orders/cart/lines/",
        {
            "variant_id": str(variant.id),
            "quantity": 2,
            "unit_price": "0.01",
            "tax_amount": "0",
        },
    )

    assert response.status_code == 201
    assert response.data["data"]["grand_total"] == "39.98"
    assert response.data["data"]["lines"][0]["unit_price"] == "19.99"


def test_customer_cannot_see_other_customers_order(api_client):
    other = create_user(email="order-other@example.com")
    order = SalesOrderFactory(customer=other)

    customer = create_user(email="order-viewer@example.com")
    api_client.force_authenticate(user=customer)

    response = api_client.get(f"/api/v1/customer/orders/{order.id}/")

    assert response.status_code == 404
    # Neutral body: an order owned by someone else must look exactly like a missing one.
    assert response.data["error"] == {
        "code": "order_not_found",
        "message": "Order not found.",
        "fields": {},
    }


def test_staff_without_permission_cannot_list_admin_orders(api_client):
    staff = create_user(email="order-staff@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)

    response = api_client.get("/api/v1/admin/orders/")

    assert response.status_code == 403


def test_admin_can_list_orders(api_client):
    admin = create_user(email="order-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    SalesOrderFactory()

    response = api_client.get("/api/v1/admin/orders/")

    assert response.status_code == 200
    assert response.data["data"]["count"] == 1


def test_staff_with_returns_permission_can_approve_rma(api_client):
    staff = create_user(email="order-staff-returns@example.com", role=UserRole.STAFF)
    admin = create_user(email="order-grantor@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.RETURNS_MANAGE,
        is_enabled=True,
        granted_by=admin,
    )
    api_client.force_authenticate(user=staff)

    from apps.orders.factories import ReturnRMAFactory

    rma = ReturnRMAFactory()

    response = api_client.post(f"/api/v1/admin/orders/returns/{rma.id}/approve/")

    assert response.status_code == 200
    assert response.data["data"]["status"] == "approved"


def test_admin_can_create_shipment_with_carrier(api_client):
    admin = create_user(email="order-admin-ship@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    customer = create_user(email="order-ship-customer@example.com")
    variant = _stocked_variant(quantity=10)
    carrier = CarrierFactory()

    cart = None
    from apps.orders.services.carts import add_line, get_or_create_cart
    from apps.orders.services.checkout import checkout
    from apps.orders.services.payments import capture_payment

    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=2)
    checkout(order=cart)
    capture_payment(order=cart, amount=cart.grand_total)
    cart.refresh_from_db()
    order_line = cart.lines.get()

    response = api_client.post(
        f"/api/v1/admin/orders/{cart.id}/shipments/",
        {
            "carrier_id": str(carrier.id),
            "tracking_number": "TRK123456",
            "lines": [{"order_line_id": str(order_line.id), "quantity": 2}],
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.data["data"]["carrier_id"] == str(carrier.id)
    assert response.data["data"]["carrier_name"] == carrier.name


def test_admin_shipment_with_unknown_carrier_returns_404(api_client):
    admin = create_user(email="order-admin-badcarrier@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    customer = create_user(email="order-badcarrier-customer@example.com")
    variant = _stocked_variant(quantity=5)

    from apps.orders.services.carts import add_line, get_or_create_cart
    from apps.orders.services.checkout import checkout
    from apps.orders.services.payments import capture_payment

    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=1)
    checkout(order=cart)
    capture_payment(order=cart, amount=cart.grand_total)
    cart.refresh_from_db()
    order_line = cart.lines.get()

    response = api_client.post(
        f"/api/v1/admin/orders/{cart.id}/shipments/",
        {
            "carrier_id": "00000000-0000-0000-0000-000000000000",
            "lines": [{"order_line_id": str(order_line.id), "quantity": 1}],
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "carrier_not_found"


def test_admin_shipment_list_query_count_does_not_grow_with_carriers(api_client):
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    from apps.logistics.factories import CarrierFactory
    from apps.orders.factories import ShipmentFactory

    admin = create_user(email="order-admin-shipment-list@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    ShipmentFactory(carrier=CarrierFactory())
    with CaptureQueriesContext(connection) as small:
        assert api_client.get("/api/v1/admin/orders/shipments/").status_code == 200

    for _ in range(5):
        ShipmentFactory(carrier=CarrierFactory())
    with CaptureQueriesContext(connection) as large:
        assert api_client.get("/api/v1/admin/orders/shipments/").status_code == 200

    assert len(large) == len(small)


def test_admin_can_cancel_pending_order(api_client):
    admin = create_user(email="order-admin-cancel@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    order = SalesOrderFactory()

    response = api_client.post(f"/api/v1/admin/orders/{order.id}/cancel/")

    assert response.status_code == 200
    assert response.data["data"]["status"] == "cancelled"
    order.refresh_from_db()
    assert order.status == SalesOrder.Status.CANCELLED


def test_admin_can_cancel_confirmed_order_and_releases_reservation(api_client):
    admin = create_user(email="order-admin-cancel2@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    customer = create_user(email="order-cancel-customer@example.com")
    variant = _stocked_variant(quantity=10)

    from apps.inventory.selectors.stock import get_stock_item
    from apps.orders.services.carts import add_line, get_or_create_cart
    from apps.orders.services.checkout import checkout
    from apps.orders.services.payments import capture_payment

    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=3)
    checkout(order=cart)
    capture_payment(order=cart, amount=cart.grand_total)
    cart.refresh_from_db()

    stock_item = get_stock_item(variant=variant)
    assert stock_item.quantity_reserved == 3

    response = api_client.post(f"/api/v1/admin/orders/{cart.id}/cancel/")

    assert response.status_code == 200
    assert response.data["data"]["status"] == "cancelled"
    stock_item.refresh_from_db()
    assert stock_item.quantity_reserved == 0


def test_admin_cannot_cancel_shipped_order(api_client):
    admin = create_user(email="order-admin-cancel3@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    order = SalesOrderFactory(status=SalesOrder.Status.SHIPPED)

    response = api_client.post(f"/api/v1/admin/orders/{order.id}/cancel/")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "invalid_order_status"


def test_staff_without_manage_permission_cannot_cancel_order(api_client):
    staff = create_user(email="order-staff-cancel@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)
    order = SalesOrderFactory()

    response = api_client.post(f"/api/v1/admin/orders/{order.id}/cancel/")

    assert response.status_code == 403


def test_customer_can_cancel_own_pending_order(api_client):
    customer = create_user(email="cust-cancel-owner@example.com")
    api_client.force_authenticate(user=customer)
    order = SalesOrderFactory(customer=customer)

    response = api_client.post(f"/api/v1/customer/orders/{order.id}/cancel/")

    assert response.status_code == 200
    assert response.data["data"]["status"] == "cancelled"
    order.refresh_from_db()
    assert order.status == SalesOrder.Status.CANCELLED


def test_customer_cannot_cancel_another_customers_order(api_client):
    customer = create_user(email="cust-cancel-intruder@example.com")
    api_client.force_authenticate(user=customer)
    other_order = SalesOrderFactory()

    response = api_client.post(f"/api/v1/customer/orders/{other_order.id}/cancel/")

    assert response.status_code == 404


def test_customer_cannot_cancel_shipped_order(api_client):
    customer = create_user(email="cust-cancel-shipped@example.com")
    api_client.force_authenticate(user=customer)
    order = SalesOrderFactory(customer=customer, status=SalesOrder.Status.SHIPPED)

    response = api_client.post(f"/api/v1/customer/orders/{order.id}/cancel/")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "invalid_order_status"


def test_customer_order_detail_exposes_shipment_tracking(api_client):
    from apps.orders.factories import ShipmentFactory

    customer = create_user(email="cust-tracking@example.com")
    api_client.force_authenticate(user=customer)
    order = SalesOrderFactory(customer=customer)
    shipment = ShipmentFactory(order=order, tracking_number="TRACK000123")

    response = api_client.get(f"/api/v1/customer/orders/{order.id}/")

    assert response.status_code == 200
    shipments = response.data["data"]["shipments"]
    assert len(shipments) == 1
    assert shipments[0]["tracking_number"] == "TRACK000123"
    assert shipments[0]["carrier_name"] == shipment.carrier.name
    assert "cod_amount" not in shipments[0]


def test_admin_can_refund_captured_payment(api_client):
    admin = create_user(email="order-admin-refund@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    payment = PaymentFactory()

    response = api_client.post(f"/api/v1/admin/orders/payments/{payment.id}/refund/")

    assert response.status_code == 200
    assert response.data["data"]["status"] == "refunded"
    payment.refresh_from_db()
    assert payment.status == Payment.Status.REFUNDED


def test_staff_with_refund_approve_permission_can_refund_payment(api_client):
    staff = create_user(email="order-staff-refund@example.com", role=UserRole.STAFF)
    grantor = create_user(email="order-grantor-refund@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.REFUNDS_APPROVE,
        is_enabled=True,
        granted_by=grantor,
    )
    api_client.force_authenticate(user=staff)
    payment = PaymentFactory()

    response = api_client.post(f"/api/v1/admin/orders/payments/{payment.id}/refund/")

    assert response.status_code == 200
    assert response.data["data"]["status"] == "refunded"


def test_staff_without_refund_permission_cannot_refund_payment(api_client):
    staff = create_user(email="order-staff-refund2@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)
    payment = PaymentFactory()

    response = api_client.post(f"/api/v1/admin/orders/payments/{payment.id}/refund/")

    assert response.status_code == 403


def test_cannot_refund_an_already_refunded_payment(api_client):
    admin = create_user(email="order-admin-refund2@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    payment = PaymentFactory(status=Payment.Status.REFUNDED)

    response = api_client.post(f"/api/v1/admin/orders/payments/{payment.id}/refund/")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "not_captured"


def test_admin_can_create_order_for_customer(api_client):
    admin = create_user(email="order-admin-create@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    customer = create_user(email="order-create-customer@example.com")
    variant = _stocked_variant(quantity=10)

    response = api_client.post(
        "/api/v1/admin/orders/",
        {
            "customer_id": str(customer.id),
            "lines": [{"variant_id": str(variant.id), "quantity": 2}],
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.data["data"]["status"] == "confirmed"
    assert response.data["data"]["customer_id"] == str(customer.id)
    assert response.data["data"]["grand_total"] == "39.98"
    assert response.data["data"]["lines"][0]["quantity"] == 2


def test_admin_create_order_without_capture_awaits_payment(api_client):
    admin = create_user(email="order-admin-create2@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    customer = create_user(email="order-create-customer2@example.com")
    variant = _stocked_variant(quantity=10)

    response = api_client.post(
        "/api/v1/admin/orders/",
        {
            "customer_id": str(customer.id),
            "lines": [{"variant_id": str(variant.id), "quantity": 1}],
            "capture_payment": False,
        },
        format="json",
    )

    assert response.status_code == 201
    # Checkout has run and reserved stock, so the order has left the cart
    # state; it sits in awaiting_payment until a payment is captured.
    assert response.data["data"]["status"] == "awaiting_payment"


def test_admin_create_order_does_not_absorb_the_customers_own_cart(api_client):
    admin = create_user(email="order-admin-create-isolated@example.com", role=UserRole.ADMIN)
    customer = create_user(email="order-create-customer-isolated@example.com")
    variant = _stocked_variant(quantity=10)

    # The customer builds their own cart first.
    own_cart = get_or_create_cart(customer)
    add_line(order=own_cart, variant=variant, quantity=4)

    api_client.force_authenticate(user=admin)
    response = api_client.post(
        "/api/v1/admin/orders/",
        {
            "customer_id": str(customer.id),
            "lines": [{"variant_id": str(variant.id), "quantity": 1}],
            "capture_payment": False,
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.data["data"]["id"] != str(own_cart.id)
    assert len(response.data["data"]["lines"]) == 1
    assert response.data["data"]["lines"][0]["quantity"] == 1

    own_cart.refresh_from_db()
    assert own_cart.status == SalesOrder.Status.PENDING
    assert own_cart.lines.count() == 1
    assert own_cart.lines.get().quantity == 4


def test_admin_create_order_with_unknown_customer_returns_error(api_client):
    admin = create_user(email="order-admin-create3@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    variant = _stocked_variant(quantity=10)

    response = api_client.post(
        "/api/v1/admin/orders/",
        {
            "customer_id": "00000000-0000-0000-0000-000000000000",
            "lines": [{"variant_id": str(variant.id), "quantity": 1}],
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "customer_not_found"


def test_admin_create_order_with_staff_user_as_customer_id_returns_error(api_client):
    admin = create_user(email="order-admin-create4@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    staff = create_user(email="order-create-notcustomer@example.com", role=UserRole.STAFF)
    variant = _stocked_variant(quantity=10)

    response = api_client.post(
        "/api/v1/admin/orders/",
        {
            "customer_id": str(staff.id),
            "lines": [{"variant_id": str(variant.id), "quantity": 1}],
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "customer_not_found"


def test_admin_create_order_with_insufficient_stock_returns_error(api_client):
    admin = create_user(email="order-admin-create5@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    customer = create_user(email="order-create-customer5@example.com")
    variant = _stocked_variant(quantity=1)

    response = api_client.post(
        "/api/v1/admin/orders/",
        {
            "customer_id": str(customer.id),
            "lines": [{"variant_id": str(variant.id), "quantity": 5}],
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "insufficient_stock"


def test_admin_create_order_rejects_empty_lines(api_client):
    admin = create_user(email="order-admin-create6@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    customer = create_user(email="order-create-customer6@example.com")

    response = api_client.post(
        "/api/v1/admin/orders/",
        {"customer_id": str(customer.id), "lines": []},
        format="json",
    )

    assert response.status_code == 400


def test_staff_without_manage_permission_cannot_create_order(api_client):
    staff = create_user(email="order-staff-create@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)
    customer = create_user(email="order-create-customer7@example.com")
    variant = _stocked_variant(quantity=10)

    response = api_client.post(
        "/api/v1/admin/orders/",
        {
            "customer_id": str(customer.id),
            "lines": [{"variant_id": str(variant.id), "quantity": 1}],
        },
        format="json",
    )

    assert response.status_code == 403


def test_staff_with_orders_manage_permission_can_create_order(api_client):
    staff = create_user(email="order-staff-create2@example.com", role=UserRole.STAFF)
    grantor = create_user(email="order-grantor-create@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.ORDERS_MANAGE,
        is_enabled=True,
        granted_by=grantor,
    )
    api_client.force_authenticate(user=staff)
    customer = create_user(email="order-create-customer8@example.com")
    variant = _stocked_variant(quantity=10)

    response = api_client.post(
        "/api/v1/admin/orders/",
        {
            "customer_id": str(customer.id),
            "lines": [{"variant_id": str(variant.id), "quantity": 1}],
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.data["data"]["status"] == "confirmed"


def test_admin_can_list_stock_reservations(api_client):
    admin = create_user(email="order-admin-res-list@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    order, variant = _reserved_order("res-list-customer@example.com")

    response = api_client.get("/api/v1/admin/orders/reservations/")

    assert response.status_code == 200
    assert response.data["data"]["count"] == 1
    row = response.data["data"]["results"][0]
    assert row["order_id"] == str(order.id)
    assert row["variant_id"] == str(variant.id)
    assert row["quantity"] == 3
    assert row["status"] == "active"


def test_admin_can_filter_reservations_by_order_and_status(api_client):
    admin = create_user(email="order-admin-res-filter@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    order, _ = _reserved_order("res-filter-customer@example.com")
    StockReservationFactory(status=StockReservation.Status.RELEASED)

    response = api_client.get(f"/api/v1/admin/orders/reservations/?order_id={order.id}")
    assert response.status_code == 200
    assert response.data["data"]["count"] == 1

    response = api_client.get("/api/v1/admin/orders/reservations/?status=released")
    assert response.status_code == 200
    assert response.data["data"]["count"] == 1
    assert response.data["data"]["results"][0]["status"] == "released"


def test_reservation_created_before_filter_excludes_recent_rows(api_client):
    admin = create_user(email="order-admin-res-stale@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    StockReservationFactory()

    response = api_client.get("/api/v1/admin/orders/reservations/?created_before=2000-01-01")

    assert response.status_code == 200
    assert response.data["data"]["count"] == 0


def test_reservation_created_before_rejects_bad_date(api_client):
    admin = create_user(email="order-admin-res-baddate@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.get("/api/v1/admin/orders/reservations/?created_before=nonsense")

    assert response.status_code == 400


def test_admin_can_retrieve_reservation_detail(api_client):
    admin = create_user(email="order-admin-res-detail@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    reservation = StockReservationFactory()

    response = api_client.get(f"/api/v1/admin/orders/reservations/{reservation.id}/")

    assert response.status_code == 200
    assert response.data["data"]["id"] == str(reservation.id)


def test_unknown_reservation_returns_404(api_client):
    admin = create_user(email="order-admin-res-404@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.get(
        "/api/v1/admin/orders/reservations/00000000-0000-0000-0000-000000000000/"
    )

    assert response.status_code == 404
    assert response.data["error"]["code"] == "reservation_not_found"


def test_staff_without_permission_cannot_list_reservations(api_client):
    staff = create_user(email="order-staff-res-list@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)

    response = api_client.get("/api/v1/admin/orders/reservations/")

    assert response.status_code == 403


def test_admin_can_release_reservation_and_free_stock(api_client):
    from apps.inventory.selectors.stock import get_stock_item

    admin = create_user(email="order-admin-res-release@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    order, variant = _reserved_order("res-release-customer@example.com")
    reservation = StockReservation.objects.get(order_line__order=order)

    stock_item = get_stock_item(variant=variant)
    assert stock_item.quantity_reserved == 3

    response = api_client.post(f"/api/v1/admin/orders/reservations/{reservation.id}/release/")

    assert response.status_code == 200
    assert response.data["data"]["status"] == "released"
    reservation.refresh_from_db()
    assert reservation.status == StockReservation.Status.RELEASED
    stock_item.refresh_from_db()
    assert stock_item.quantity_reserved == 0


def test_releasing_an_already_released_reservation_errors(api_client):
    admin = create_user(email="order-admin-res-release2@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    order, _ = _reserved_order("res-release2-customer@example.com")
    reservation = StockReservation.objects.get(order_line__order=order)

    first = api_client.post(f"/api/v1/admin/orders/reservations/{reservation.id}/release/")
    assert first.status_code == 200

    second = api_client.post(f"/api/v1/admin/orders/reservations/{reservation.id}/release/")

    assert second.status_code == 400
    assert second.data["error"]["code"] == "already_released"


def test_staff_without_manage_permission_cannot_release_reservation(api_client):
    staff = create_user(email="order-staff-res-release@example.com", role=UserRole.STAFF)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.ORDERS_VIEW,
        is_enabled=True,
        granted_by=create_user(email="order-grantor-res@example.com", role=UserRole.ADMIN),
    )
    api_client.force_authenticate(user=staff)
    reservation = StockReservationFactory()

    response = api_client.post(f"/api/v1/admin/orders/reservations/{reservation.id}/release/")

    assert response.status_code == 403


def test_admin_can_patch_order_notes_and_shipping_address(api_client):
    admin = create_user(email="order-admin-patch@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    customer = create_user(email="order-patch-customer@example.com")
    order = SalesOrderFactory(customer=customer)
    address = AddressFactory(user=customer)

    response = api_client.patch(
        f"/api/v1/admin/orders/{order.id}/",
        {"notes": "Ring the bell twice.", "shipping_address_id": str(address.id)},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["data"]["notes"] == "Ring the bell twice."
    assert response.data["data"]["shipping_address_id"] == str(address.id)
    order.refresh_from_db()
    assert order.shipping_address_id == address.id


def test_patch_order_cannot_change_status(api_client):
    admin = create_user(email="order-admin-patch-status@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    order = SalesOrderFactory(status=SalesOrder.Status.PENDING)

    response = api_client.patch(
        f"/api/v1/admin/orders/{order.id}/",
        {"status": "delivered", "notes": "smuggling attempt"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["data"]["status"] == "pending"
    order.refresh_from_db()
    assert order.status == SalesOrder.Status.PENDING
    assert order.notes == "smuggling attempt"


def test_patch_order_with_only_status_changes_nothing(api_client):
    admin = create_user(email="order-admin-patch-status2@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    order = SalesOrderFactory(status=SalesOrder.Status.CONFIRMED)

    response = api_client.patch(
        f"/api/v1/admin/orders/{order.id}/", {"status": "shipped"}, format="json"
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "no_updatable_fields"
    order.refresh_from_db()
    assert order.status == SalesOrder.Status.CONFIRMED


def test_patch_order_rejects_address_owned_by_another_customer(api_client):
    admin = create_user(email="order-admin-patch-addr@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    customer = create_user(email="order-patch-owner@example.com")
    other = create_user(email="order-patch-other@example.com")
    order = SalesOrderFactory(customer=customer)
    foreign_address = AddressFactory(user=other)

    response = api_client.patch(
        f"/api/v1/admin/orders/{order.id}/",
        {"shipping_address_id": str(foreign_address.id)},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "address_not_found"
    order.refresh_from_db()
    assert order.shipping_address_id is None


def test_patch_unknown_order_returns_404(api_client):
    admin = create_user(email="order-admin-patch-404@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.patch(
        "/api/v1/admin/orders/00000000-0000-0000-0000-000000000000/",
        {"notes": "x"},
        format="json",
    )

    assert response.status_code == 404
    assert response.data["error"]["code"] == "order_not_found"


def test_staff_with_view_only_cannot_patch_order(api_client):
    staff = create_user(email="order-staff-patch@example.com", role=UserRole.STAFF)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.ORDERS_VIEW,
        is_enabled=True,
        granted_by=create_user(email="order-grantor-patch@example.com", role=UserRole.ADMIN),
    )
    api_client.force_authenticate(user=staff)
    order = SalesOrderFactory()

    response = api_client.patch(
        f"/api/v1/admin/orders/{order.id}/", {"notes": "nope"}, format="json"
    )

    assert response.status_code == 403


def test_admin_can_list_payments_with_filters(api_client):
    admin = create_user(email="order-admin-pay-list@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    payment = PaymentFactory(method="card")
    PaymentFactory(method="cash", status=Payment.Status.PENDING)

    response = api_client.get("/api/v1/admin/orders/payments/")
    assert response.status_code == 200
    assert response.data["data"]["count"] == 2

    response = api_client.get("/api/v1/admin/orders/payments/?method=card")
    assert response.data["data"]["count"] == 1
    assert response.data["data"]["results"][0]["id"] == str(payment.id)

    response = api_client.get("/api/v1/admin/orders/payments/?status=pending")
    assert response.data["data"]["count"] == 1

    response = api_client.get(f"/api/v1/admin/orders/payments/?order_id={payment.order_id}")
    assert response.data["data"]["count"] == 1


def test_payment_list_rejects_inverted_date_range(api_client):
    admin = create_user(email="order-admin-pay-range@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.get("/api/v1/admin/orders/payments/?start=2024-05-01&end=2024-04-01")

    assert response.status_code == 400


def test_admin_can_retrieve_payment_detail(api_client):
    admin = create_user(email="order-admin-pay-detail@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    payment = PaymentFactory()

    response = api_client.get(f"/api/v1/admin/orders/payments/{payment.id}/")

    assert response.status_code == 200
    assert response.data["data"]["id"] == str(payment.id)


def test_unknown_payment_returns_404(api_client):
    admin = create_user(email="order-admin-pay-404@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.get("/api/v1/admin/orders/payments/00000000-0000-0000-0000-000000000000/")

    assert response.status_code == 404
    assert response.data["error"]["code"] == "payment_not_found"


def test_payment_refund_route_still_resolves(api_client):
    admin = create_user(email="order-admin-pay-refund-route@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    payment = PaymentFactory()

    response = api_client.post(f"/api/v1/admin/orders/payments/{payment.id}/refund/")

    assert response.status_code == 200
    assert response.data["data"]["status"] == "refunded"


def test_staff_without_permission_cannot_list_payments(api_client):
    staff = create_user(email="order-staff-pay-list@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)

    response = api_client.get("/api/v1/admin/orders/payments/")

    assert response.status_code == 403


def test_admin_can_export_orders_as_csv(api_client):
    admin = create_user(email="order-admin-export@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    order = SalesOrderFactory()

    response = api_client.get("/api/v1/admin/orders/export/")

    assert response.status_code == 200
    assert response["Content-Type"] == "text/csv"
    assert 'filename="orders.csv"' in response["Content-Disposition"]
    body = response.content.decode()
    assert "order_number" in body.splitlines()[0]
    assert order.order_number in body


def test_order_export_honours_status_and_search_filters(api_client):
    admin = create_user(email="order-admin-export2@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    cancelled = SalesOrderFactory(status=SalesOrder.Status.CANCELLED)
    pending = SalesOrderFactory(status=SalesOrder.Status.PENDING)

    response = api_client.get("/api/v1/admin/orders/export/?status=cancelled")
    body = response.content.decode()
    assert cancelled.order_number in body
    assert pending.order_number not in body

    response = api_client.get(f"/api/v1/admin/orders/export/?search={pending.order_number}")
    body = response.content.decode()
    assert pending.order_number in body
    assert cancelled.order_number not in body


def test_order_export_rejects_inverted_date_range(api_client):
    admin = create_user(email="order-admin-export3@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.get("/api/v1/admin/orders/export/?start=2024-05-01&end=2024-04-01")

    assert response.status_code == 400


def test_staff_without_permission_cannot_export_orders(api_client):
    staff = create_user(email="order-staff-export@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)

    response = api_client.get("/api/v1/admin/orders/export/")

    assert response.status_code == 403


def test_order_list_lines_expose_human_labels_without_n_plus_one(api_client):
    admin = create_user(email="orders-line-labels@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    variant = ProductVariantFactory(sku="SKU-ORDER-LABEL")
    order = SalesOrderFactory()
    SalesOrderLineFactory(order=order, variant=variant)

    with CaptureQueriesContext(connection) as single_row:
        response = api_client.get("/api/v1/admin/orders/")

    assert response.status_code == 200
    line = response.data["data"]["results"][0]["lines"][0]
    assert line["variant_sku"] == "SKU-ORDER-LABEL"
    assert line["product_name"] == variant.product.name

    for _ in range(3):
        SalesOrderLineFactory()
    with CaptureQueriesContext(connection) as many_rows:
        api_client.get("/api/v1/admin/orders/")

    assert len(many_rows) == len(single_row)


def test_payment_list_exposes_order_number_without_n_plus_one(api_client):
    admin = create_user(email="orders-payment-labels@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    order = SalesOrderFactory(order_number="SO-LABEL-01")
    PaymentFactory(order=order)

    with CaptureQueriesContext(connection) as single_row:
        response = api_client.get("/api/v1/admin/orders/payments/")

    assert response.status_code == 200
    assert response.data["data"]["results"][0]["order_number"] == "SO-LABEL-01"

    PaymentFactory.create_batch(3)
    with CaptureQueriesContext(connection) as many_rows:
        api_client.get("/api/v1/admin/orders/payments/")

    assert len(many_rows) == len(single_row)


def test_reservation_list_exposes_human_labels_without_n_plus_one(api_client):
    admin = create_user(email="orders-reservation-labels@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    variant = ProductVariantFactory(sku="SKU-RESERVATION")
    order = SalesOrderFactory(order_number="SO-LABEL-02")
    line = SalesOrderLineFactory(order=order, variant=variant)
    StockReservationFactory(order_line=line, variant=variant)

    with CaptureQueriesContext(connection) as single_row:
        response = api_client.get("/api/v1/admin/orders/reservations/")

    assert response.status_code == 200
    row = response.data["data"]["results"][0]
    assert row["order_number"] == "SO-LABEL-02"
    assert row["variant_sku"] == "SKU-RESERVATION"
    assert row["product_name"] == variant.product.name

    StockReservationFactory.create_batch(3)
    with CaptureQueriesContext(connection) as many_rows:
        api_client.get("/api/v1/admin/orders/reservations/")

    assert len(many_rows) == len(single_row)


def test_order_list_lines_expose_fulfilment_counters_without_extra_queries(api_client):
    admin = create_user(email="orders-fulfilment-counters@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    order = SalesOrderFactory()
    SalesOrderLineFactory(order=order, quantity=5, shipped_quantity=3, returned_quantity=1)

    with CaptureQueriesContext(connection) as single_row:
        response = api_client.get("/api/v1/admin/orders/")

    assert response.status_code == 200
    line = response.data["data"]["results"][0]["lines"][0]
    assert line["quantity"] == 5
    assert line["shipped_quantity"] == 3
    assert line["returned_quantity"] == 1
    assert line["shippable_quantity"] == 2
    assert line["returnable_quantity"] == 2

    for _ in range(3):
        SalesOrderLineFactory(quantity=5, shipped_quantity=3, returned_quantity=1)
    with CaptureQueriesContext(connection) as many_rows:
        api_client.get("/api/v1/admin/orders/")

    assert len(many_rows) == len(single_row)


def test_order_list_identifies_customer_by_name_and_phone_without_n_plus_one(api_client):
    admin = create_user(email="orders-customer-identity@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    customer = create_user(email="guest.01712345678@guest.checkout.local")
    address = AddressFactory(
        user=customer,
        full_name="Rakib Hossain",
        phone="+8801712345678",
        line1="House 42, Road 11, Banani",
        line2="Call before delivery",
        city="Dhaka",
        state="Gulshan",
    )
    SalesOrderFactory(customer=customer, shipping_address=address)

    with CaptureQueriesContext(connection) as single_row:
        response = api_client.get("/api/v1/admin/orders/")

    assert response.status_code == 200
    row = response.data["data"]["results"][0]
    assert row["customer_name"] == "Rakib Hossain"
    assert row["customer_phone"] == "+8801712345678"
    assert row["shipping_address"]["delivery_note"] == "Call before delivery"

    for _ in range(3):
        other = CustomerUserFactory(first_name="Nusrat", last_name="Islam")
        SalesOrderFactory(customer=other, shipping_address=AddressFactory(user=other))
    with CaptureQueriesContext(connection) as many_rows:
        api_client.get("/api/v1/admin/orders/")

    assert len(many_rows) == len(single_row)


def test_order_customer_name_falls_back_when_address_is_missing(api_client):
    admin = create_user(email="orders-name-fallback@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    named = CustomerUserFactory(first_name="Tanvir", last_name="Ahmed")
    SalesOrderFactory(customer=named, shipping_address=None)

    response = api_client.get("/api/v1/admin/orders/")

    row = response.data["data"]["results"][0]
    assert row["customer_name"] == "Tanvir Ahmed"
    assert row["shipping_address"] is None


def test_order_lines_expose_product_image_without_n_plus_one(api_client):
    admin = create_user(email="orders-line-image@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    variant = ProductVariantFactory(sku="SKU-ORDER-IMG")
    ProductImageFactory(product=variant.product, url="https://img.test/order.jpg", sort_order=0)
    SalesOrderLineFactory(variant=variant)

    with CaptureQueriesContext(connection) as single_row:
        response = api_client.get("/api/v1/admin/orders/")

    assert response.status_code == 200
    line = response.data["data"]["results"][0]["lines"][0]
    assert line["product_image"] == "https://img.test/order.jpg"

    for _ in range(3):
        other = ProductVariantFactory()
        ProductImageFactory(product=other.product)
        SalesOrderLineFactory(variant=other)
    with CaptureQueriesContext(connection) as many_rows:
        api_client.get("/api/v1/admin/orders/")

    assert len(many_rows) == len(single_row)


def _admin_checked_out_order(api_client, slug: str, quantity: int = 3, stock: int = 20):
    from apps.orders.services.carts import add_line, get_or_create_cart
    from apps.orders.services.checkout import checkout

    admin = create_user(email=f"order-admin-{slug}@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    customer = create_user(email=f"order-cust-{slug}@example.com")
    variant = _stocked_variant(quantity=stock)
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=quantity)
    checkout(order=cart)
    cart.refresh_from_db()
    return cart, variant


def test_admin_can_edit_ship_to_details_on_the_order(api_client):
    order, _ = _admin_checked_out_order(api_client, "shipto")

    response = api_client.patch(
        f"/api/v1/admin/orders/{order.id}/",
        {"full_name": "Corrected Name", "line1": "New Road 7", "contact_phone": "01700000000"},
        format="json",
    )

    assert response.status_code == 200
    address = response.data["data"]["shipping_address"]
    assert address["full_name"] == "Corrected Name"
    assert address["line1"] == "New Road 7"
    assert response.data["data"]["customer_phone"] == "01700000000"


def test_admin_can_change_a_line_quantity(api_client):
    order, variant = _admin_checked_out_order(api_client, "lineqty")
    line = order.lines.get()

    response = api_client.patch(
        f"/api/v1/admin/orders/{order.id}/lines/{line.id}/",
        {"quantity": 6},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["data"]["lines"][0]["quantity"] == 6
    assert get_stock_item(variant=variant).quantity_reserved == 6


def test_admin_can_add_a_line_to_a_checked_out_order(api_client):
    order, _ = _admin_checked_out_order(api_client, "lineadd")
    extra = _stocked_variant(quantity=10)
    total_before = order.grand_total

    response = api_client.post(
        f"/api/v1/admin/orders/{order.id}/lines/",
        {"variant_id": str(extra.id), "quantity": 2},
        format="json",
    )

    assert response.status_code == 201
    assert len(response.data["data"]["lines"]) == 2
    assert get_stock_item(variant=extra).quantity_reserved == 2
    order.refresh_from_db()
    assert order.grand_total > total_before


def test_admin_cannot_add_a_variant_already_on_the_order(api_client):
    order, variant = _admin_checked_out_order(api_client, "linedup")

    response = api_client.post(
        f"/api/v1/admin/orders/{order.id}/lines/",
        {"variant_id": str(variant.id), "quantity": 1},
        format="json",
    )

    assert response.status_code >= 400
    assert response.data["error"]["code"] == "line_exists"
    assert get_stock_item(variant=variant).quantity_reserved == 3


def test_admin_cannot_add_a_line_without_enough_stock(api_client):
    order, _ = _admin_checked_out_order(api_client, "linenostock")
    scarce = _stocked_variant(quantity=1)

    response = api_client.post(
        f"/api/v1/admin/orders/{order.id}/lines/",
        {"variant_id": str(scarce.id), "quantity": 5},
        format="json",
    )

    assert response.status_code >= 400
    assert order.lines.count() == 1
    assert get_stock_item(variant=scarce).quantity_reserved == 0


def test_admin_line_edit_on_another_order_is_404(api_client):
    order, _ = _admin_checked_out_order(api_client, "linemismatch")
    other = SalesOrderFactory()

    response = api_client.patch(
        f"/api/v1/admin/orders/{other.id}/lines/{order.lines.get().id}/",
        {"quantity": 2},
        format="json",
    )

    assert response.status_code == 404
    assert response.data["error"]["code"] == "order_line_not_found"


def test_admin_can_set_order_status(api_client):
    order, _ = _admin_checked_out_order(api_client, "status")
    # Closing skips nothing only once the order is paid for; unpaid orders are cancelled.
    SalesOrder.objects.filter(pk=order.pk).update(status=SalesOrder.Status.CONFIRMED)

    response = api_client.post(
        f"/api/v1/admin/orders/{order.id}/status/", {"status": "closed"}, format="json"
    )

    assert response.status_code == 200
    assert response.data["data"]["status"] == "closed"


def test_admin_cannot_mark_an_unshipped_order_delivered(api_client):
    order, _ = _admin_checked_out_order(api_client, "statusdelivered")
    previous = order.status

    response = api_client.post(
        f"/api/v1/admin/orders/{order.id}/status/", {"status": "delivered"}, format="json"
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "shipments_incomplete"
    order.refresh_from_db()
    assert order.status == previous


def test_admin_status_cancel_releases_reservations(api_client):
    order, variant = _admin_checked_out_order(api_client, "statuscancel")

    response = api_client.post(
        f"/api/v1/admin/orders/{order.id}/status/", {"status": "cancelled"}, format="json"
    )

    assert response.status_code == 200
    assert get_stock_item(variant=variant).quantity_reserved == 0


# ---------------------------------------------------------------------------
# Order number format tests
# ---------------------------------------------------------------------------


def test_generate_order_number_stock_uses_so_prefix_and_digits_only():
    from apps.common.utils.codes import generate_order_number

    number = generate_order_number(kind="stock")
    assert number.startswith("SO-")
    suffix = number[len("SO-") :]
    assert len(suffix) == 9
    assert suffix.isdigit()


def test_generate_order_number_preorder_uses_pre_prefix_and_digits_only():
    from apps.common.utils.codes import generate_order_number

    number = generate_order_number(kind="preorder")
    assert number.startswith("PRE-")
    suffix = number[len("PRE-") :]
    assert len(suffix) == 9
    assert suffix.isdigit()


def test_create_order_stock_uses_so_prefix():
    from apps.accounts.factories import CustomerUserFactory
    from apps.orders.services.carts import create_order

    customer = CustomerUserFactory()
    order = create_order(customer=customer, kind="stock")
    assert order.order_number.startswith("SO-")
    assert order.order_number[len("SO-") :].isdigit()


def test_create_order_preorder_uses_pre_prefix():
    from apps.accounts.factories import CustomerUserFactory
    from apps.orders.services.carts import create_order

    customer = CustomerUserFactory()
    order = create_order(customer=customer, kind="preorder")
    assert order.order_number.startswith("PRE-")
    assert order.order_number[len("PRE-") :].isdigit()


def test_create_order_numbers_are_unique():
    from apps.accounts.factories import CustomerUserFactory
    from apps.orders.services.carts import create_order

    customer = CustomerUserFactory()
    numbers = set()
    for _ in range(50):
        order = create_order(customer=customer, kind="stock")
        assert order.order_number not in numbers
        numbers.add(order.order_number)


def test_checkout_changes_prefix_to_pre_for_preorder(api_client):
    from datetime import timedelta

    from django.utils import timezone

    from apps.common.params import KIND_PREORDER
    from apps.inventory.constants import MovementType
    from apps.inventory.selectors.warehouse import get_or_create_default_warehouse
    from apps.inventory.services.stock import record_movement
    from apps.orders.services.carts import add_line, get_or_create_cart
    from apps.orders.services.checkout import checkout

    admin = create_user(email="order-prefix-checkout@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    customer = create_user(email="order-prefix-cust@example.com")

    get_or_create_default_warehouse(KIND_PREORDER)

    now = timezone.now()
    variant = ProductVariantFactory(
        product__category__category_type="preorder",
        is_preorder_enabled=True,
        preorder_start_date=now - timedelta(days=1),
        preorder_end_date=now + timedelta(days=10),
    )
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("5.00"),
    )

    cart = get_or_create_cart(customer)
    # Cart starts with SO- number
    assert cart.order_number.startswith("SO-")
    add_line(order=cart, variant=variant, quantity=1)
    order = checkout(order=cart)
    # After checkout, pre-order gets PRE- prefix
    assert order.order_number.startswith("PRE-")
    assert order.order_number[len("PRE-") :].isdigit()


def test_place_staff_order_uses_pre_prefix_for_preorder(api_client):
    from datetime import timedelta

    from django.utils import timezone

    from apps.accounts.factories import CustomerUserFactory
    from apps.orders.constants import PaymentMethodKey
    from apps.orders.services.staff_orders import place_staff_order

    admin = create_user(email="order-staff-pre@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    customer = CustomerUserFactory()
    now = timezone.now()
    variant = ProductVariantFactory(
        product__category__category_type="preorder",
        is_preorder_enabled=True,
        preorder_start_date=now - timedelta(days=1),
        preorder_end_date=now + timedelta(days=10),
    )

    order = place_staff_order(
        customer=customer,
        lines=[(variant, 1)],
        kind="preorder",
        payment_method=PaymentMethodKey.MANUAL,
        capture=False,
        actor=admin,
    )
    assert order.order_number.startswith("PRE-")
    assert order.order_number[len("PRE-") :].isdigit()


def test_place_staff_order_uses_so_prefix_for_stock(api_client):
    from apps.accounts.factories import CustomerUserFactory
    from apps.orders.constants import PaymentMethodKey
    from apps.orders.services.staff_orders import place_staff_order

    admin = create_user(email="order-staff-stock@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    customer = CustomerUserFactory()
    variant = _stocked_variant(quantity=10)

    order = place_staff_order(
        customer=customer,
        lines=[(variant, 1)],
        kind="stock",
        payment_method=PaymentMethodKey.MANUAL,
        capture=True,
        actor=admin,
    )
    assert order.order_number.startswith("SO-")
    assert order.order_number[len("SO-") :].isdigit()
