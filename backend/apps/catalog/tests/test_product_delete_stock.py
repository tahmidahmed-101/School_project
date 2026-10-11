"""A product can only be deleted once every variant holds no stock — on hand or
reserved, in any warehouse — and no reservation is active. Clearing stock is
the operator's job, through the existing write-off flow; deleting never writes
anything off or releases a hold, and the soft delete keeps stock history."""

from __future__ import annotations

from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounting.constants import ACCOUNT_CODES
from apps.accounting.models import JournalEntryLine
from apps.accounting.tests.helpers import seed_chart_of_accounts
from apps.accounts.constants import StaffPermissionCode
from apps.accounts.factories import CustomerUserFactory
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.catalog.factories import BundleItemFactory, ProductFactory, ProductVariantFactory
from apps.catalog.models import Product, ProductVariant
from apps.inventory.constants import MovementType
from apps.inventory.models import StockItem, StockLedgerEntry, Warehouse
from apps.inventory.selectors.warehouse import get_or_create_default_warehouse
from apps.inventory.services.stock import record_movement
from apps.orders.factories import StockReservationFactory
from apps.orders.models import StockReservation
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.orders import cancel_order

pytestmark = pytest.mark.django_db

WRITE_OFF_URL = "/api/v1/admin/inventory/write-offs/"


def _url(product) -> str:
    return f"/api/v1/admin/catalog/products/{product.id}/"


def _stock_in(variant, quantity: int, warehouse=None) -> None:
    record_movement(
        variant=variant,
        warehouse=warehouse,
        movement_type=MovementType.PURCHASE_IN,
        quantity=quantity,
        unit_cost=Decimal("10"),
    )


def _product(variants: int = 1):
    product = ProductFactory(is_active=True)
    return product, [ProductVariantFactory(product=product) for _ in range(variants)]


def _second_warehouse() -> Warehouse:
    get_or_create_default_warehouse()
    return Warehouse.objects.create(name="Overflow", code="OVF")


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


def _assert_blocked(response, product, *mentions: str) -> None:
    assert response.status_code == 409, response.data
    assert response.data["error"]["code"] == "product_stock_in_use"
    for text in mentions:
        assert text in response.data["error"]["message"]
    product.refresh_from_db()
    assert product.deleted_at is None
    # The whole delete rolled back: live variants are still live.
    assert ProductVariant.objects.filter(product=product, deleted_at__isnull=True).exists()


# --- Blocked ------------------------------------------------------------------------


def test_stock_in_one_warehouse_blocks_deletion_and_changes_nothing(admin_client):
    product, (variant,) = _product()
    _stock_in(variant, 5)
    ledger_before = StockLedgerEntry.objects.count()

    response = admin_client.delete(_url(product))

    _assert_blocked(response, product, variant.sku, "5 on hand", "Write the stock off")
    assert StockItem.objects.get(variant=variant, quantity_on_hand=5)
    assert StockLedgerEntry.objects.count() == ledger_before


def test_stock_on_any_variant_blocks_deletion(admin_client):
    product, (_empty, stocked) = _product(variants=2)
    _stock_in(stocked, 1)

    _assert_blocked(admin_client.delete(_url(product)), product, stocked.sku)


def test_stock_in_any_warehouse_blocks_deletion(admin_client):
    product, (variant,) = _product()
    overflow = _second_warehouse()
    _stock_in(variant, 2, warehouse=overflow)

    _assert_blocked(admin_client.delete(_url(product)), product, variant.sku, "Overflow")


def test_stock_on_a_previously_deleted_variant_still_blocks(admin_client):
    product, (_kept, removed) = _product(variants=2)
    _stock_in(removed, 3)
    ProductVariant.objects.filter(pk=removed.pk).update(deleted_at=product.created_at)

    _assert_blocked(admin_client.delete(_url(product)), product, removed.sku)


def test_reserved_stock_blocks_even_with_nothing_available(admin_client):
    product, (variant,) = _product()
    _stock_in(variant, 2)
    order = get_or_create_cart(CustomerUserFactory())
    add_line(order=order, variant=variant, quantity=2)
    checkout(order=order)  # 2 on hand, 2 reserved, 0 available

    _assert_blocked(admin_client.delete(_url(product)), product, "2 reserved")


def test_an_active_reservation_blocks_even_when_stock_rows_are_zero(admin_client):
    product, (variant,) = _product()
    StockReservationFactory(variant=variant, order_line__variant=variant)

    _assert_blocked(admin_client.delete(_url(product)), product, "active order reservation")


def test_a_bundle_on_an_open_order_blocks_deletion(admin_client):
    bundle_product = ProductFactory(is_active=True, product_type=Product.ProductType.BUNDLE)
    bundle = ProductVariantFactory(product=bundle_product)
    component = ProductVariantFactory()
    BundleItemFactory(bundle_variant=bundle, component_variant=component, quantity=1)
    _stock_in(component, 1)
    order = get_or_create_cart(CustomerUserFactory())
    add_line(order=order, variant=bundle, quantity=1)
    checkout(order=order)  # reserves the component under the bundle's order line

    _assert_blocked(admin_client.delete(_url(bundle_product)), bundle_product, "reservation")


# --- Allowed ------------------------------------------------------------------------


def test_product_with_no_stock_can_be_deleted(admin_client):
    product, _ = _product(variants=2)

    response = admin_client.delete(_url(product))

    assert response.status_code == 200
    product.refresh_from_db()
    assert product.deleted_at is not None


def test_deletion_succeeds_after_write_off_and_resolved_reservations(admin_client):
    seed_chart_of_accounts()
    product, (variant,) = _product()
    _stock_in(variant, 3)
    order = get_or_create_cart(CustomerUserFactory())
    add_line(order=order, variant=variant, quantity=1)
    checkout(order=order)
    assert admin_client.delete(_url(product)).status_code == 409

    cancel_order(order=order)  # the operator resolves the order holding stock
    write_off = admin_client.post(
        WRITE_OFF_URL,
        {"variant_id": str(variant.id), "quantity": 3, "reason": "Discontinued"},
        format="json",
    )
    response = admin_client.delete(_url(product))

    assert write_off.status_code == 201, write_off.data
    assert response.status_code == 200, response.data
    product.refresh_from_db()
    assert product.deleted_at is not None


def test_soft_delete_keeps_stock_rows_and_ledger_history(admin_client):
    seed_chart_of_accounts()
    product, (variant,) = _product()
    _stock_in(variant, 2)
    admin_client.post(WRITE_OFF_URL, {"variant_id": str(variant.id), "quantity": 2}, format="json")
    rows = StockItem.objects.filter(variant=variant).count()
    ledger = list(
        StockLedgerEntry.objects.filter(variant=variant).values_list("movement_type", flat=True)
    )

    assert admin_client.delete(_url(product)).status_code == 200

    assert StockItem.objects.filter(variant=variant).count() == rows
    assert sorted(
        StockLedgerEntry.objects.filter(variant=variant).values_list("movement_type", flat=True)
    ) == sorted(ledger)
    assert set(ledger) == {MovementType.PURCHASE_IN, MovementType.WRITE_OFF}


def test_the_stock_check_does_not_query_per_variant(admin_client):
    small, _ = _product(variants=1)
    large, _ = _product(variants=6)

    with CaptureQueriesContext(connection) as one:
        assert admin_client.delete(_url(small)).status_code == 200
    with CaptureQueriesContext(connection) as six:
        assert admin_client.delete(_url(large)).status_code == 200

    assert len(six) == len(one)


# --- The write-off flow itself is unchanged ------------------------------------------


def test_write_off_still_requires_an_inventory_adjust_permission(api_client, staff_user):
    seed_chart_of_accounts()
    _, (variant,) = _product()
    _stock_in(variant, 2)
    set_staff_permission(
        staff_user=staff_user, permission_code=StaffPermissionCode.CATALOG_MANAGE, is_enabled=True
    )
    api_client.force_authenticate(user=staff_user)
    payload = {"variant_id": str(variant.id), "quantity": 1}

    assert api_client.post(WRITE_OFF_URL, payload, format="json").status_code == 403
    set_staff_permission(
        staff_user=staff_user,
        permission_code=StaffPermissionCode.INVENTORY_ADJUST,
        is_enabled=True,
    )
    assert api_client.post(WRITE_OFF_URL, payload, format="json").status_code == 201


def test_write_off_validation_and_shrinkage_posting_are_unchanged(admin_client):
    seed_chart_of_accounts()
    _, (variant,) = _product()
    _stock_in(variant, 2)

    zero = admin_client.post(
        WRITE_OFF_URL, {"variant_id": str(variant.id), "quantity": 0}, format="json"
    )
    blank_reason = admin_client.post(
        WRITE_OFF_URL,
        {"variant_id": str(variant.id), "quantity": 2, "reason": ""},
        format="json",
    )

    assert zero.status_code == 400
    assert blank_reason.status_code == 201  # the reason stays optional, as before
    shrinkage = JournalEntryLine.objects.filter(
        journal_entry__reference_type="stock_writeoff",
        account__code=ACCOUNT_CODES["inventory_shrinkage"],
    )
    assert sum(line.debit for line in shrinkage) == Decimal("20.00")


# --- Clearing a product from the delete dialog -----------------------------------------

STOCK_ITEMS_URL = "/api/v1/admin/inventory/stock-items/"
RESERVATIONS_URL = "/api/v1/admin/orders/reservations/"
ADJUSTMENT_URL = "/api/v1/admin/inventory/adjustments/"


def _reserve(variant, quantity: int):
    order = get_or_create_cart(CustomerUserFactory())
    add_line(order=order, variant=variant, quantity=quantity)
    checkout(order=order)
    return order


def _quantities(variant) -> tuple[int, int]:
    item = StockItem.objects.get(variant=variant)
    return item.quantity_on_hand, item.quantity_reserved


def test_stock_and_reservations_can_be_listed_for_one_product(admin_client):
    product, (first, second) = _product(variants=2)
    _, (other,) = _product()
    _stock_in(first, 3)
    _stock_in(second, 1)
    _stock_in(other, 5)
    _reserve(first, 2)
    _reserve(other, 1)

    stock = admin_client.get(STOCK_ITEMS_URL, {"product_id": str(product.id)})
    held = admin_client.get(RESERVATIONS_URL, {"product_id": str(product.id), "status": "active"})

    assert stock.status_code == 200, stock.data
    rows = {row["variant_id"]: row for row in stock.data["data"]["results"]}
    assert set(rows) == {str(first.id), str(second.id)}
    row = rows[str(first.id)]
    assert (row["quantity_on_hand"], row["quantity_reserved"], row["available"]) == (3, 2, 1)
    assert held.status_code == 200, held.data
    assert [row["variant_id"] for row in held.data["data"]["results"]] == [str(first.id)]


def test_a_bundles_reservations_are_listed_under_the_bundle(admin_client):
    bundle = ProductFactory(is_active=True, product_type=Product.ProductType.BUNDLE)
    bundle_variant = ProductVariantFactory(product=bundle)
    component = ProductVariantFactory()
    BundleItemFactory(bundle_variant=bundle_variant, component_variant=component, quantity=1)
    _stock_in(component, 2)
    _reserve(bundle_variant, 1)

    held = admin_client.get(RESERVATIONS_URL, {"product_id": str(bundle.id), "status": "active"})

    assert [row["variant_id"] for row in held.data["data"]["results"]] == [str(component.id)]


@pytest.mark.parametrize(
    ("url", "payload"),
    [
        (WRITE_OFF_URL, {"quantity": 2}),
        (ADJUSTMENT_URL, {"quantity_delta": -2}),
    ],
)
def test_reserved_units_cannot_be_removed_from_under_an_order(admin_client, url, payload):
    seed_chart_of_accounts()
    _, (variant,) = _product()
    _stock_in(variant, 3)
    _reserve(variant, 2)  # 3 on hand, 2 reserved, 1 available

    response = admin_client.post(url, {"variant_id": str(variant.id), **payload}, format="json")

    assert response.status_code == 400, response.data
    assert response.data["error"]["code"] == "stock_reserved"
    assert _quantities(variant) == (3, 2)
    assert not StockLedgerEntry.objects.filter(variant=variant).exclude(
        movement_type=MovementType.PURCHASE_IN
    ).exists()


def test_a_product_is_cleared_and_deleted_through_the_existing_endpoints(admin_client, admin_user):
    seed_chart_of_accounts()
    product, (variant,) = _product()
    _stock_in(variant, 3)
    _reserve(variant, 2)
    reservation = StockReservation.objects.get(variant=variant)
    assert admin_client.delete(_url(product)).status_code == 409

    available = admin_client.post(
        WRITE_OFF_URL, {"variant_id": str(variant.id), "quantity": 1}, format="json"
    )
    still_held = admin_client.delete(_url(product))
    released = admin_client.post(f"{RESERVATIONS_URL}{reservation.id}/release/")
    rest = admin_client.post(
        WRITE_OFF_URL,
        {"variant_id": str(variant.id), "quantity": 2, "reason": "Discontinued"},
        format="json",
    )
    deleted = admin_client.delete(_url(product))

    assert available.status_code == 201, available.data
    assert still_held.status_code == 409
    assert released.status_code == 200, released.data
    assert rest.status_code == 201, rest.data
    assert deleted.status_code == 200, deleted.data
    assert _quantities(variant) == (0, 0)
    write_offs = StockLedgerEntry.objects.filter(
        variant=variant, movement_type=MovementType.WRITE_OFF
    )
    assert {entry.created_by_id for entry in write_offs} == {admin_user.id}
    assert sum(entry.quantity for entry in write_offs) == 3


def test_adjusting_stock_needs_an_inventory_permission(api_client, staff_user):
    seed_chart_of_accounts()
    _, (variant,) = _product()
    _stock_in(variant, 2)
    set_staff_permission(
        staff_user=staff_user, permission_code=StaffPermissionCode.CATALOG_MANAGE, is_enabled=True
    )
    api_client.force_authenticate(user=staff_user)
    payload = {"variant_id": str(variant.id), "quantity_delta": 4, "notes": "Recount"}

    assert api_client.post(ADJUSTMENT_URL, payload, format="json").status_code == 403
    set_staff_permission(
        staff_user=staff_user,
        permission_code=StaffPermissionCode.INVENTORY_ADJUST,
        is_enabled=True,
    )
    response = api_client.post(ADJUSTMENT_URL, payload, format="json")

    assert response.status_code == 201, response.data
    assert _quantities(variant) == (6, 0)
    entry = StockLedgerEntry.objects.get(variant=variant, movement_type=MovementType.ADJUSTMENT_IN)
    assert (entry.quantity, entry.notes, entry.created_by_id) == (4, "Recount", staff_user.id)
    too_many = api_client.post(
        ADJUSTMENT_URL, {"variant_id": str(variant.id), "quantity_delta": -7}, format="json"
    )
    assert too_many.status_code == 400
    assert too_many.data["error"]["code"] == "insufficient_stock"
    assert _quantities(variant) == (6, 0)
