from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from apps.accounting.tests.helpers import seed_chart_of_accounts
from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductVariantFactory
from apps.catalog.models import Category
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.models import StockItem, StockLedgerEntry, Warehouse
from apps.inventory.selectors.stock import available_quantities_for_variants, get_stock_item
from apps.inventory.selectors.warehouse import default_warehouse, get_or_create_default_warehouse
from apps.inventory.services.stock import (
    lock_variant_stock,
    materialize_stock_items,
    post_adjustment,
    record_movement,
    reserve_stock,
)
from apps.inventory.services.warehouses import (
    create_warehouse,
    delete_warehouse,
    update_warehouse,
)
from apps.orders.services.preorder_allocation import allocate_preorder_stock
from apps.procurement.factories import SupplierFactory
from apps.procurement.models import GoodsReceiptNote, GRNLine
from apps.procurement.services.goods_receipt import create_goods_receipt
from apps.procurement.services.purchase_orders import (
    create_purchase_order,
    submit_purchase_order,
)

pytestmark = pytest.mark.django_db

BASE = "/api/v1/admin/inventory/warehouses/"
STOCK = Category.CategoryType.STOCK
PREORDER = Category.CategoryType.PREORDER


@pytest.fixture(autouse=True)
def _chart_of_accounts(db):
    seed_chart_of_accounts()


@pytest.fixture
def admin_client(api_client):
    api_client.force_authenticate(
        user=create_user(email="warehouse-kind-admin@example.com", role=UserRole.ADMIN)
    )
    return api_client


def _variant(kind):
    return ProductVariantFactory(product__category__category_type=kind)


def _receive(variant, warehouse=None, quantity=5):
    return record_movement(
        variant=variant,
        warehouse=warehouse,
        movement_type=MovementType.PURCHASE_IN,
        quantity=quantity,
        unit_cost=Decimal("5.00"),
    )


def _receive_purchase_order(variant):
    purchase_order = submit_purchase_order(
        purchase_order=create_purchase_order(
            supplier=SupplierFactory(kind=variant.product.category.category_type),
            order_date=date.today(),
            lines=[{"variant": variant, "quantity_ordered": 4, "unit_cost": Decimal("4.00")}],
        )
    )
    return create_goods_receipt(
        purchase_order=purchase_order,
        received_date=date.today(),
        received_by=None,
        lines=[
            {
                "purchase_order_line": purchase_order.lines.get(),
                "quantity_received": 4,
                "condition": GRNLine.Condition.ACCEPTED,
            }
        ],
    )


def test_each_kind_lands_in_its_own_default_warehouse():
    preorder_warehouse = get_or_create_default_warehouse(PREORDER)
    shop_item, booked = _variant(STOCK), _variant(PREORDER)

    assert _receive(shop_item).warehouse == default_warehouse(STOCK)
    assert _receive(booked).warehouse == preorder_warehouse
    assert reserve_stock(variant=booked, quantity=2).warehouse == preorder_warehouse
    assert get_stock_item(variant=booked).warehouse == preorder_warehouse
    assert available_quantities_for_variants([shop_item.id, booked.id]) == {
        shop_item.id: 5,
        booked.id: 3,
    }


def test_preorder_movement_fails_when_there_is_no_preorder_warehouse():
    booked = _variant(PREORDER)
    _receive(_variant(STOCK))

    for write in (_receive, lambda variant: reserve_stock(variant=variant, quantity=1)):
        with pytest.raises(BusinessRuleViolationError) as exc:
            write(booked)
        assert exc.value.code == "preorder_warehouse_missing"

    assert not StockItem.objects.filter(variant=booked).exists()
    assert not Warehouse.objects.filter(kind=PREORDER).exists()


def test_preorder_goods_receipt_needs_and_uses_the_preorder_warehouse():
    booked = _variant(PREORDER)

    with pytest.raises(BusinessRuleViolationError) as exc:
        _receive_purchase_order(booked)
    assert exc.value.code == "preorder_warehouse_missing"
    assert not GoodsReceiptNote.objects.exists()

    preorder_warehouse = get_or_create_default_warehouse(PREORDER)
    _receive_purchase_order(booked)

    row = StockItem.objects.get(variant=booked)
    assert (row.warehouse, row.quantity_on_hand) == (preorder_warehouse, 4)


def test_allocation_fails_when_there_is_no_preorder_warehouse():
    get_or_create_default_warehouse(STOCK)

    with pytest.raises(BusinessRuleViolationError) as exc:
        allocate_preorder_stock()

    assert exc.value.code == "preorder_warehouse_missing"


@pytest.mark.parametrize(("variant_kind", "warehouse_kind"), [(PREORDER, STOCK), (STOCK, PREORDER)])
def test_a_variant_cannot_go_into_a_warehouse_of_the_other_kind(variant_kind, warehouse_kind):
    variant = _variant(variant_kind)
    get_or_create_default_warehouse(PREORDER)
    other = Warehouse.objects.create(name="Other half", code="OTHER", kind=warehouse_kind)
    writes = (
        lambda: _receive(variant, other),
        lambda: _receive(variant, str(other.id)),
        lambda: reserve_stock(variant=variant, warehouse=other, quantity=1),
        lambda: post_adjustment(
            variant=variant, warehouse=other.id, quantity_delta=1, unit_cost=Decimal("5.00")
        ),
        lambda: record_movement(
            variant=variant, warehouse=other, movement_type=MovementType.TRANSFER_IN, quantity=1
        ),
    )

    for write in writes:
        with pytest.raises(BusinessRuleViolationError) as exc:
            write()
        assert exc.value.code == "warehouse_kind_mismatch"

    assert not StockItem.objects.filter(warehouse=other).exists()
    assert not StockLedgerEntry.objects.filter(warehouse=other).exists()


def test_placeholder_rows_are_made_only_in_warehouses_of_the_variants_kind():
    shop_item, booked = _variant(STOCK), _variant(PREORDER)
    main = get_or_create_default_warehouse(STOCK)
    preorder_warehouse = create_warehouse(
        data={"name": "Import Store", "code": "IMP", "kind": PREORDER, "is_default": True}
    )
    branch = create_warehouse(data={"name": "Branch", "code": "BR", "kind": STOCK})

    materialize_stock_items()
    lock_variant_stock([shop_item.id, booked.id])

    pairs = set(StockItem.objects.values_list("variant_id", "warehouse_id"))
    assert pairs == {
        (shop_item.id, main.id),
        (shop_item.id, branch.id),
        (booked.id, preorder_warehouse.id),
    }


def test_one_default_per_kind():
    main = get_or_create_default_warehouse(STOCK)
    first = get_or_create_default_warehouse(PREORDER)

    second = create_warehouse(
        data={"name": "New Import Store", "code": "IMP-2", "kind": PREORDER, "is_default": True}
    )

    first.refresh_from_db()
    main.refresh_from_db()
    assert (main.is_default, first.is_default, second.is_default) == (True, False, True)
    assert default_warehouse(PREORDER) == second
    assert default_warehouse(STOCK) == main


def test_kind_cannot_change_while_the_warehouse_holds_stock_rows():
    main = get_or_create_default_warehouse(STOCK)
    _receive(_variant(STOCK))
    empty = Warehouse.objects.create(name="Empty", code="EMPTY")

    with pytest.raises(BusinessRuleViolationError) as exc:
        update_warehouse(warehouse=main, data={"kind": PREORDER})
    assert exc.value.code == "warehouse_kind_in_use"
    main.refresh_from_db()
    assert main.kind == STOCK

    assert update_warehouse(warehouse=main, data={"kind": STOCK, "name": "Main"}).name == "Main"
    assert update_warehouse(warehouse=empty, data={"kind": PREORDER}).kind == PREORDER


def test_warehouse_api_lists_and_creates_by_kind(admin_client):
    main = get_or_create_default_warehouse(STOCK)
    _receive(_variant(STOCK))
    booked = _variant(PREORDER)

    created = admin_client.post(
        BASE,
        {"name": "Import Store", "code": "IMP", "kind": "preorder", "is_default": True},
        format="json",
    )
    assert created.status_code == 201
    assert created.data["data"]["kind"] == "preorder"
    assert created.data["data"]["is_default"] is True
    main.refresh_from_db()
    assert main.is_default

    def names(query: str) -> list[str]:
        response = admin_client.get(f"{BASE}{query}")
        assert response.status_code == 200
        return [(row["name"], row["kind"]) for row in response.data["data"]["results"]]

    assert names("?kind=preorder") == [("Import Store", "preorder")]
    assert names("?kind=stock") == [(main.name, "stock")]
    assert len(names("")) == 2
    assert admin_client.get(f"{BASE}?kind=both").status_code == 400

    imported = created.data["data"]["id"]
    assert list(StockItem.objects.filter(warehouse_id=imported).values_list("variant_id")) == [
        (booked.id,)
    ]
    refused = admin_client.patch(f"{BASE}{imported}/", {"kind": "stock"}, format="json")
    assert refused.status_code == 400
    assert refused.data["error"]["code"] == "warehouse_kind_in_use"

    mismatch = admin_client.post(
        "/api/v1/admin/inventory/intake/",
        {"variant_id": str(booked.id), "warehouse_id": str(main.id), "quantity": 1},
        format="json",
    )
    assert mismatch.status_code == 400
    assert mismatch.data["error"]["code"] == "warehouse_kind_mismatch"


def _second_stock_warehouse():
    get_or_create_default_warehouse(Category.CategoryType.STOCK)
    return create_warehouse(
        data={"name": "Overflow", "code": "OVERFLOW", "kind": Category.CategoryType.STOCK}
    )


def test_an_empty_warehouse_can_be_deleted_although_it_has_stock_rows():
    variant = ProductVariantFactory()
    warehouse = _second_stock_warehouse()
    assert StockItem.objects.filter(warehouse=warehouse, variant=variant).exists()

    delete_warehouse(warehouse=warehouse)

    warehouse.refresh_from_db()
    assert warehouse.deleted_at is not None
    assert not StockItem.objects.filter(warehouse=warehouse).exists()


def test_a_warehouse_holding_units_cannot_be_deleted():
    variant = ProductVariantFactory()
    warehouse = _second_stock_warehouse()
    record_movement(
        variant=variant,
        warehouse=warehouse,
        movement_type=MovementType.PURCHASE_IN,
        quantity=3,
        unit_cost=Decimal("5.00"),
    )

    with pytest.raises(BusinessRuleViolationError) as exc:
        delete_warehouse(warehouse=warehouse)

    assert exc.value.code == "warehouse_has_stock"
    warehouse.refresh_from_db()
    assert warehouse.deleted_at is None


def test_the_default_warehouse_cannot_be_deleted():
    warehouse = get_or_create_default_warehouse(Category.CategoryType.STOCK)

    with pytest.raises(BusinessRuleViolationError) as exc:
        delete_warehouse(warehouse=warehouse)

    assert exc.value.code == "cannot_delete_default_warehouse"
