from __future__ import annotations

from decimal import Decimal

import pytest

from apps.accounts.factories import AdminUserFactory
from apps.catalog.factories import ProductVariantFactory
from apps.catalog.models import Category
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.models import StockLedgerEntry, StockTransfer
from apps.inventory.selectors.stock import get_stock_item
from apps.inventory.selectors.warehouse import get_or_create_default_warehouse
from apps.inventory.services.stock import record_movement, reserve_stock
from apps.inventory.services.transfers import transfer_stock
from apps.inventory.services.warehouses import create_warehouse

pytestmark = pytest.mark.django_db

STOCK = Category.CategoryType.STOCK
PREORDER = Category.CategoryType.PREORDER


def _receive(variant, warehouse, quantity, unit_cost):
    record_movement(
        variant=variant,
        warehouse=warehouse,
        movement_type=MovementType.PURCHASE_IN,
        quantity=quantity,
        unit_cost=Decimal(unit_cost),
    )


@pytest.fixture
def main():
    return get_or_create_default_warehouse(STOCK)


@pytest.fixture
def branch(main):
    return create_warehouse(data={"name": "Branch", "code": "BR", "kind": STOCK})


def test_transfer_moves_units_and_carries_their_cost(main, branch):
    variant = ProductVariantFactory()
    _receive(variant, main, 10, "4.00")
    _receive(variant, branch, 2, "10.00")

    transfer = transfer_stock(
        from_warehouse=main, to_warehouse=branch, lines=[{"variant": variant, "quantity": 6}]
    )

    source = get_stock_item(variant=variant, warehouse=main)
    destination = get_stock_item(variant=variant, warehouse=branch)
    assert source.quantity_on_hand == 4
    assert destination.quantity_on_hand == 8
    # (2 x 10 + 6 x 4) / 8
    assert destination.avg_cost == Decimal("5.5")
    entries = StockLedgerEntry.objects.filter(reference_id=transfer.id)
    assert sorted(entries.values_list("movement_type", flat=True)) == [
        MovementType.TRANSFER_IN,
        MovementType.TRANSFER_OUT,
    ]
    line = transfer.lines.get()
    assert (line.quantity, line.unit_cost) == (6, Decimal("4.0000"))


def test_reserved_units_do_not_move(main, branch):
    variant = ProductVariantFactory()
    _receive(variant, main, 5, "4.00")
    reserve_stock(variant=variant, warehouse=main, quantity=3)

    with pytest.raises(BusinessRuleViolationError) as exc:
        transfer_stock(
            from_warehouse=main, to_warehouse=branch, lines=[{"variant": variant, "quantity": 3}]
        )

    assert exc.value.code == "insufficient_stock"
    assert get_stock_item(variant=variant, warehouse=main).quantity_on_hand == 5


def test_a_failing_line_rolls_the_whole_transfer_back(main, branch):
    plenty, short = ProductVariantFactory(), ProductVariantFactory()
    _receive(plenty, main, 10, "4.00")
    _receive(short, main, 1, "4.00")

    with pytest.raises(BusinessRuleViolationError):
        transfer_stock(
            from_warehouse=main,
            to_warehouse=branch,
            lines=[{"variant": plenty, "quantity": 5}, {"variant": short, "quantity": 2}],
        )

    assert get_stock_item(variant=plenty, warehouse=main).quantity_on_hand == 10
    assert not StockTransfer.objects.exists()


def test_repeated_lines_are_checked_together(main, branch):
    variant = ProductVariantFactory()
    _receive(variant, main, 4, "4.00")

    with pytest.raises(BusinessRuleViolationError) as exc:
        transfer_stock(
            from_warehouse=main,
            to_warehouse=branch,
            lines=[{"variant": variant, "quantity": 3}, {"variant": variant, "quantity": 3}],
        )

    assert exc.value.code == "insufficient_stock"


def test_stock_cannot_move_into_the_same_warehouse_or_another_kind(main):
    variant = ProductVariantFactory()
    _receive(variant, main, 4, "4.00")
    preorder = create_warehouse(data={"name": "Pre-order", "code": "PO-WH", "kind": PREORDER})

    with pytest.raises(BusinessRuleViolationError) as same:
        transfer_stock(
            from_warehouse=main, to_warehouse=main, lines=[{"variant": variant, "quantity": 1}]
        )
    with pytest.raises(BusinessRuleViolationError) as other_kind:
        transfer_stock(
            from_warehouse=main, to_warehouse=preorder, lines=[{"variant": variant, "quantity": 1}]
        )

    assert same.value.code == "same_warehouse"
    assert other_kind.value.code == "warehouse_kind_mismatch"


def test_transfer_api_creates_and_lists_transfers(api_client, main, branch):
    variant = ProductVariantFactory()
    _receive(variant, main, 10, "4.00")
    api_client.force_authenticate(user=AdminUserFactory())

    response = api_client.post(
        "/api/v1/admin/inventory/transfers/",
        {
            "from_warehouse_id": str(main.id),
            "to_warehouse_id": str(branch.id),
            "lines": [{"variant_id": str(variant.id), "quantity": 4}],
            "notes": "Stocking the branch",
        },
        format="json",
    )

    assert response.status_code == 201
    data = response.data["data"]
    assert data["from_warehouse_name"] == main.name
    assert data["lines"][0]["quantity"] == 4

    listing = api_client.get("/api/v1/admin/inventory/transfers/", {"warehouse_id": str(branch.id)})
    assert listing.status_code == 200
    assert [row["id"] for row in listing.data["data"]["results"]] == [data["id"]]

    detail = api_client.get(f"/api/v1/admin/inventory/transfers/{data['id']}/")
    assert detail.data["data"]["transfer_number"] == data["transfer_number"]
