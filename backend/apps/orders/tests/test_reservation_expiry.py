from __future__ import annotations

from datetime import timedelta
from io import StringIO

import pytest
from django.core.management import call_command
from django.db.models import Sum
from django.test import override_settings
from django.utils import timezone

from apps.accounts.factories import CustomerUserFactory
from apps.catalog.factories import ProductVariantFactory
from apps.inventory.constants import MovementType
from apps.inventory.models import StockItem
from apps.inventory.selectors.stock import get_stock_item
from apps.inventory.services.stock import record_movement
from apps.orders.models import StockReservation
from apps.orders.selectors.reservations import reservations_list
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.payments import capture_payment
from apps.orders.services.reservations import release_expired_reservations
from apps.orders.services.shipments import create_shipment

pytestmark = pytest.mark.django_db


def _reserved_order(quantity=4, stock=10):
    variant = ProductVariantFactory()
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=stock,
        unit_cost=1,
    )
    cart = get_or_create_cart(CustomerUserFactory())
    add_line(order=cart, variant=variant, quantity=quantity)
    checkout(order=cart)
    return cart, variant


@override_settings(STOCK_RESERVATION_TTL_HOURS=6)
def test_checkout_stamps_expiry_from_the_configured_ttl():
    before = timezone.now()
    cart, _ = _reserved_order()

    reservation = StockReservation.objects.get(order_line__order=cart)

    assert reservation.expires_at >= before + timedelta(hours=6)
    assert reservation.expires_at <= timezone.now() + timedelta(hours=6)
    assert reservation.is_expired is False


def test_release_expired_reservations_returns_stock_to_available():
    cart, variant = _reserved_order(quantity=4, stock=10)
    reservation = StockReservation.objects.get(order_line__order=cart)
    StockReservation.objects.filter(pk=reservation.pk).update(
        expires_at=timezone.now() - timedelta(minutes=1)
    )

    assert release_expired_reservations() == 1

    reservation.refresh_from_db()
    assert reservation.status == StockReservation.Status.RELEASED
    stock_item = get_stock_item(variant=variant)
    assert stock_item.quantity_reserved == 0
    assert stock_item.quantity_on_hand == 10


def test_release_expired_reservations_leaves_live_reservations_alone():
    cart, _ = _reserved_order()

    assert release_expired_reservations() == 0

    assert StockReservation.objects.get(order_line__order=cart).status == (
        StockReservation.Status.ACTIVE
    )


def test_release_expired_reservations_is_idempotent():
    cart, _ = _reserved_order()
    StockReservation.objects.filter(order_line__order=cart).update(
        expires_at=timezone.now() - timedelta(minutes=1)
    )

    assert release_expired_reservations() == 1
    assert release_expired_reservations() == 0


def test_management_command_releases_expired_reservations():
    cart, _ = _reserved_order()
    StockReservation.objects.filter(order_line__order=cart).update(
        expires_at=timezone.now() - timedelta(minutes=1)
    )
    out = StringIO()

    call_command("release_expired_reservations", stdout=out)

    assert "Released 1" in out.getvalue()
    assert StockReservation.objects.get(order_line__order=cart).status == (
        StockReservation.Status.RELEASED
    )


def test_expired_filter_uses_the_real_expiry_field():
    live_cart, _ = _reserved_order()
    stale_cart, _ = _reserved_order()
    stale = StockReservation.objects.get(order_line__order=stale_cart)
    StockReservation.objects.filter(pk=stale.pk).update(
        expires_at=timezone.now() - timedelta(minutes=1)
    )

    expired = list(reservations_list(expired=True))
    live = list(reservations_list(expired=False))

    assert [item.id for item in expired] == [stale.id]
    assert stale.id not in {item.id for item in live}
    assert StockReservation.objects.get(order_line__order=live_cart).id in {
        item.id for item in live
    }


def test_admin_reservation_list_exposes_expiry_and_filters_on_it(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    cart, _ = _reserved_order()
    reservation = StockReservation.objects.get(order_line__order=cart)
    StockReservation.objects.filter(pk=reservation.pk).update(
        expires_at=timezone.now() - timedelta(minutes=1)
    )

    response = api_client.get("/api/v1/admin/orders/reservations/?expired=true")

    assert response.status_code == 200
    row = response.data["data"]["results"][0]
    assert row["id"] == str(reservation.id)
    assert row["is_expired"] is True
    assert row["expires_at"] is not None


def _shipped_order(quantity=4, stock=10, ship=None):
    cart, variant = _reserved_order(quantity=quantity, stock=stock)
    capture_payment(order=cart, amount=cart.grand_total)
    cart.refresh_from_db()
    line = cart.lines.get()
    create_shipment(order=cart, lines=[{"order_line": line, "quantity": ship or quantity}])
    return cart, variant


def _total_reserved():
    return StockItem.objects.aggregate(total=Sum("quantity_reserved"))["total"] or 0


def test_backfill_closes_shipped_rows_without_touching_quantity_reserved():
    cart, _ = _shipped_order()
    reservation = StockReservation.objects.get(order_line__order=cart)
    # Reproduce the pre-fix rows: create_shipment already gave the units back
    # to Available but left the reservation row open.
    StockReservation.objects.filter(pk=reservation.pk).update(status=StockReservation.Status.ACTIVE)
    before = _total_reserved()
    out = StringIO()

    call_command("backfill_shipped_reservations", "--apply", stdout=out)

    reservation.refresh_from_db()
    assert reservation.status == StockReservation.Status.RELEASED
    assert _total_reserved() == before
    assert "Closed 1 reservation row(s)." in out.getvalue()


def test_backfill_dry_run_leaves_the_rows_open():
    cart, _ = _shipped_order()
    StockReservation.objects.filter(order_line__order=cart).update(
        status=StockReservation.Status.ACTIVE
    )
    before = _total_reserved()
    out = StringIO()

    call_command("backfill_shipped_reservations", stdout=out)

    assert StockReservation.objects.get(order_line__order=cart).status == (
        StockReservation.Status.ACTIVE
    )
    assert _total_reserved() == before
    assert "Rows to close on fully shipped lines: 1" in out.getvalue()
    assert "DRY RUN" in out.getvalue()


def test_backfill_is_idempotent():
    cart, _ = _shipped_order()
    StockReservation.objects.filter(order_line__order=cart).update(
        status=StockReservation.Status.ACTIVE
    )
    call_command("backfill_shipped_reservations", "--apply", stdout=StringIO())
    out = StringIO()

    call_command("backfill_shipped_reservations", "--apply", stdout=out)

    assert "Closed 0 reservation row(s)." in out.getvalue()


def test_backfill_skips_partially_shipped_lines():
    cart, _ = _shipped_order(quantity=4, stock=10, ship=1)
    before = _total_reserved()
    out = StringIO()

    call_command("backfill_shipped_reservations", "--apply", stdout=out)

    assert StockReservation.objects.get(order_line__order=cart).status == (
        StockReservation.Status.ACTIVE
    )
    assert _total_reserved() == before
    assert "Skipped (partially shipped): 1 row(s)" in out.getvalue()
