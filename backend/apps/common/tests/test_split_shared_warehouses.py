from __future__ import annotations

from io import StringIO

import pytest
from django.core.management import call_command
from django.db.models import Sum

from apps.catalog.factories import ProductVariantFactory
from apps.catalog.models import Category
from apps.inventory.constants import MovementType
from apps.inventory.models import StockItem, StockLedgerEntry, Warehouse
from apps.inventory.selectors.warehouse import get_or_create_default_warehouse
from apps.inventory.services.stock import release_reservation
from apps.orders.factories import StockReservationFactory
from apps.orders.models import StockReservation

pytestmark = pytest.mark.django_db

STOCK = Category.CategoryType.STOCK
PREORDER = Category.CategoryType.PREORDER
COMMAND = "split_shared_warehouses"


def _run(*args) -> str:
    out = StringIO()
    call_command(COMMAND, *args, stdout=out)
    return out.getvalue()


def _warehouse(name: str, code: str, **fields) -> Warehouse:
    return Warehouse.objects.create(name=name, code=code, **fields)


def _main() -> Warehouse:
    main = get_or_create_default_warehouse(STOCK)
    Warehouse.objects.filter(pk=main.pk).update(name="Main", code="MAIN", address="12 Station Road")
    main.refresh_from_db()
    return main


def _hold(warehouse, kind, *, on_hand: int, reserved: int = 0):
    """A stock row and its ledger row as they were written before warehouses had a kind."""
    variant = ProductVariantFactory(product__category__category_type=kind)
    StockItem.objects.create(
        variant=variant, warehouse=warehouse, quantity_on_hand=on_hand, quantity_reserved=reserved
    )
    StockLedgerEntry.objects.create(
        variant=variant,
        warehouse=warehouse,
        movement_type=MovementType.PURCHASE_IN,
        quantity=on_hand,
        balance_after=on_hand,
    )
    return variant


def _quantities() -> dict:
    return {
        row["variant_id"]: (row["on_hand"], row["reserved"])
        for row in StockItem.objects.values("variant_id").annotate(
            on_hand=Sum("quantity_on_hand"), reserved=Sum("quantity_reserved")
        )
    }


def _snapshot() -> list:
    return [
        list(Warehouse.objects.order_by("id").values("id", "name", "kind", "is_default")),
        list(StockItem.objects.order_by("id").values("id", "warehouse_id", "quantity_on_hand")),
        list(StockLedgerEntry.objects.order_by("id").values("id", "warehouse_id")),
    ]


@pytest.fixture
def shared():
    main = _main()
    shop_item = _hold(main, STOCK, on_hand=7, reserved=1)
    booked = _hold(main, PREORDER, on_hand=5, reserved=2)
    return main, shop_item, booked


def test_dry_run_reports_and_writes_nothing(shared):
    before = _snapshot()

    output = _run()

    assert (
        "Warehouse 'Main': would move 1 pre-order stock row(s) (5 on hand, 2 reserved) and "
        "1 ledger row(s) to a new pre-order warehouse 'Main (pre-order)'"
    ) in output
    assert "3 row(s) would change. Dry run; nothing written." in output
    assert _snapshot() == before


def test_apply_moves_preorder_rows_and_keeps_every_quantity(shared):
    main, shop_item, booked = shared
    reservation = StockReservationFactory(variant=booked, quantity=2)
    before = _quantities()

    output = _run("--apply")

    assert "3 row(s) changed." in output
    twin = Warehouse.objects.get(kind=PREORDER)
    assert (twin.name, twin.code, twin.address, twin.is_default) == (
        "Main (pre-order)",
        "MAIN-PRE",
        "12 Station Road",
        True,
    )
    main.refresh_from_db()
    assert main.is_default and main.kind == STOCK
    assert _quantities() == before
    assert StockItem.objects.get(variant=booked).warehouse == twin
    assert StockLedgerEntry.objects.get(variant=booked).warehouse == twin
    assert StockItem.objects.get(variant=shop_item).warehouse == main
    assert StockLedgerEntry.objects.get(variant=shop_item).warehouse == main
    reservation.refresh_from_db()
    assert (reservation.quantity, reservation.status) == (2, StockReservation.Status.ACTIVE)
    assert release_reservation(variant=booked, quantity=2).quantity_reserved == 0


def test_second_run_changes_nothing(shared):
    _run("--apply")
    before = _snapshot()

    assert "0 row(s) changed." in _run("--apply")
    assert "0 row(s) would change" in _run()
    assert _snapshot() == before


def test_each_shared_warehouse_gets_its_own_preorder_warehouse(shared):
    main, _shop_item, booked = shared
    branch = _warehouse("Branch", "BR")
    StockItem.objects.create(variant=booked, warehouse=branch, quantity_on_hand=4)

    _run("--apply")

    twin = Warehouse.objects.get(code="BR-PRE")
    assert (twin.kind, twin.is_default) == (PREORDER, False)
    assert StockItem.objects.get(variant=booked, warehouse=twin).quantity_on_hand == 4
    assert StockItem.objects.get(variant=booked, warehouse__code="MAIN-PRE").quantity_on_hand == 5
    assert not StockItem.objects.filter(variant=booked, warehouse__in=[main, branch]).exists()


def test_empty_placeholder_rows_are_removed_without_a_new_warehouse(shared):
    _main_warehouse, _shop_item, booked = shared
    branch = _warehouse("Branch", "BR")
    StockItem.objects.create(variant=booked, warehouse=branch)
    before = _quantities()

    assert "Warehouse 'Branch': would remove 1 empty pre-order stock row(s)" in _run()
    output = _run("--apply")

    assert "Warehouse 'Branch': 1 empty pre-order stock row(s) removed" in output
    assert "4 row(s) changed." in output
    assert not Warehouse.objects.filter(code="BR-PRE").exists()
    assert not StockItem.objects.filter(warehouse=branch).exists()
    assert _quantities() == before
    assert "0 row(s) changed." in _run("--apply")


def test_goods_join_a_default_preorder_warehouse_that_already_exists(shared):
    _main, _shop_item, booked = shared
    existing = _warehouse("Import Store", "IMP", kind=PREORDER, is_default=True)
    StockItem.objects.create(variant=booked, warehouse=existing, quantity_on_hand=1)

    output = _run("--apply")

    assert "to the existing pre-order warehouse 'Import Store'" in output
    assert Warehouse.objects.filter(kind=PREORDER).count() == 1
    row = StockItem.objects.get(variant=booked)
    assert (row.warehouse, row.quantity_on_hand, row.quantity_reserved) == (existing, 6, 2)


def test_an_empty_default_preorder_warehouse_is_made_when_nothing_is_shared():
    main = _main()
    _hold(main, STOCK, on_hand=3)

    assert "would make an empty one, 'Pre-order Warehouse'" in _run()
    assert not Warehouse.objects.filter(kind=PREORDER).exists()

    output = _run("--apply")

    assert "made an empty one, 'Pre-order Warehouse'" in output
    assert "1 row(s) changed." in output
    created = Warehouse.objects.get(kind=PREORDER)
    assert created.is_default and not created.stock_items.exists()
    assert "0 row(s) changed." in _run("--apply")
