from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from apps.accounts.constants import UserRole
from apps.accounts.factories import UserFactory
from apps.catalog.factories import ProductFactory, ProductVariantFactory
from apps.catalog.models import Category
from apps.common.exceptions import BusinessRuleViolationError
from apps.procurement.factories import (
    PurchaseOrderFactory,
    PurchaseOrderLineFactory,
    SupplierFactory,
)
from apps.procurement.services.purchase_orders import (
    add_purchase_order_line,
    create_purchase_order,
    update_purchase_order,
    update_purchase_order_line,
)
from apps.procurement.services.suppliers import update_supplier
from apps.procurement.services.vendor_bills import create_vendor_bill

pytestmark = pytest.mark.django_db

STOCK = Category.CategoryType.STOCK
PREORDER = Category.CategoryType.PREORDER


def _variant(kind):
    return ProductVariantFactory(product=ProductFactory(category__category_type=kind))


def _line(variant):
    return {"variant": variant, "quantity_ordered": 5, "unit_cost": Decimal("10.00")}


def _purchase_order(kind):
    return create_purchase_order(
        supplier=SupplierFactory(kind=kind),
        order_date=date.today(),
        lines=[_line(_variant(kind))],
    )


def test_a_purchase_order_cannot_mix_stock_and_preorder_items():
    with pytest.raises(BusinessRuleViolationError) as error:
        create_purchase_order(
            supplier=SupplierFactory(kind=STOCK),
            order_date=date.today(),
            lines=[_line(_variant(STOCK)), _line(_variant(PREORDER))],
        )
    assert error.value.code == "purchase_kind_mismatch"


def test_a_line_of_the_other_kind_is_refused_on_add_and_on_edit():
    purchase_order = _purchase_order(PREORDER)

    with pytest.raises(BusinessRuleViolationError):
        add_purchase_order_line(
            purchase_order=purchase_order,
            variant=_variant(STOCK),
            quantity_ordered=1,
            unit_cost=Decimal("1.00"),
        )
    add_purchase_order_line(
        purchase_order=purchase_order,
        variant=_variant(PREORDER),
        quantity_ordered=1,
        unit_cost=Decimal("1.00"),
    )
    with pytest.raises(BusinessRuleViolationError):
        update_purchase_order_line(
            purchase_order=purchase_order,
            line=purchase_order.lines.first(),
            data={"variant": _variant(STOCK)},
        )


def test_the_only_line_of_a_purchase_order_keeps_the_kind_of_its_supplier():
    purchase_order = _purchase_order(STOCK)

    with pytest.raises(BusinessRuleViolationError) as error:
        update_purchase_order_line(
            purchase_order=purchase_order,
            line=purchase_order.lines.get(),
            data={"variant": _variant(PREORDER)},
        )
    assert error.value.code == "supplier_kind_mismatch"


@pytest.mark.parametrize("kind", [STOCK, PREORDER])
def test_a_purchase_order_takes_a_supplier_of_its_own_kind(kind):
    other = PREORDER if kind == STOCK else STOCK

    with pytest.raises(BusinessRuleViolationError) as error:
        create_purchase_order(
            supplier=SupplierFactory(kind=other),
            order_date=date.today(),
            lines=[_line(_variant(kind))],
        )
    assert error.value.code == "supplier_kind_mismatch"

    purchase_order = _purchase_order(kind)
    with pytest.raises(BusinessRuleViolationError) as error:
        update_purchase_order(
            purchase_order=purchase_order, data={"supplier": SupplierFactory(kind=other)}
        )
    assert error.value.code == "supplier_kind_mismatch"
    update_purchase_order(
        purchase_order=purchase_order, data={"supplier": SupplierFactory(kind=kind)}
    )


def test_a_vendor_bill_takes_a_supplier_of_the_kind_of_its_purchase_order():
    purchase_order = _purchase_order(PREORDER)

    with pytest.raises(BusinessRuleViolationError) as error:
        create_vendor_bill(
            purchase_order=purchase_order,
            supplier=SupplierFactory(kind=STOCK),
            amount=Decimal("0.00"),
            due_date=date.today(),
        )
    assert error.value.code == "supplier_kind_mismatch"

    bill = create_vendor_bill(
        purchase_order=purchase_order,
        supplier=purchase_order.supplier,
        amount=Decimal("0.00"),
        due_date=date.today(),
    )
    assert bill.supplier.kind == PREORDER


def test_a_purchase_order_from_before_the_split_can_still_be_edited():
    purchase_order = PurchaseOrderFactory(supplier=SupplierFactory(kind=STOCK))
    PurchaseOrderLineFactory(purchase_order=purchase_order, variant=_variant(PREORDER))

    add_purchase_order_line(
        purchase_order=purchase_order,
        variant=_variant(PREORDER),
        quantity_ordered=1,
        unit_cost=Decimal("1.00"),
    )
    update_purchase_order(
        purchase_order=purchase_order,
        data={"supplier": purchase_order.supplier, "notes": "kept"},
    )


def test_a_supplier_in_use_keeps_its_kind():
    unused = SupplierFactory()
    assert update_supplier(supplier=unused, data={"kind": PREORDER}).kind == PREORDER

    used = _purchase_order(STOCK).supplier
    with pytest.raises(BusinessRuleViolationError) as error:
        update_supplier(supplier=used, data={"kind": PREORDER})
    assert error.value.code == "supplier_kind_in_use"
    update_supplier(supplier=used, data={"kind": STOCK, "name": "Same kind is fine"})


def test_supplier_list_and_create_follow_kind(api_client):
    api_client.force_authenticate(user=UserFactory(role=UserRole.ADMIN))
    base = "/api/v1/admin/procurement/suppliers/"
    stock = SupplierFactory(name="Shared name")

    created = api_client.post(base, {"name": "Shared name", "kind": PREORDER})
    assert created.status_code == 201
    assert created.json()["data"]["kind"] == PREORDER
    assert api_client.post(base, {"name": "Plain"}).json()["data"]["kind"] == STOCK

    rows = api_client.get(f"{base}?kind={PREORDER}").json()["data"]["results"]
    assert [row["id"] for row in rows] == [created.json()["data"]["id"]]
    rows = api_client.get(f"{base}?kind={STOCK}").json()["data"]["results"]
    assert str(stock.id) in [row["id"] for row in rows]
    assert {row["kind"] for row in rows} == {STOCK}
    assert api_client.get(f"{base}?kind=x").status_code == 400

    api_client.delete(f"{base}{created.json()['data']['id']}/")
    deleted = api_client.get(f"{base}?include_deleted=true&kind={STOCK}").json()["data"]
    assert created.json()["data"]["id"] not in [row["id"] for row in deleted["results"]]
    deleted = api_client.get(f"{base}?include_deleted=true&kind={PREORDER}").json()["data"]
    assert [row["id"] for row in deleted["results"]] == [created.json()["data"]["id"]]


@pytest.mark.parametrize("kind", [STOCK, PREORDER])
def test_purchase_order_list_returns_one_kind(api_client, kind):
    api_client.force_authenticate(user=UserFactory(role=UserRole.ADMIN))
    wanted = _purchase_order(kind)
    _purchase_order(PREORDER if kind == STOCK else STOCK)

    response = api_client.get(f"/api/v1/admin/procurement/purchase-orders/?kind={kind}")

    assert response.status_code == 200
    rows = response.json()["data"]["results"]
    assert [row["id"] for row in rows] == [str(wanted.id)]
    assert rows[0]["kind"] == kind


def test_the_other_purchasing_lists_take_kind_and_refuse_a_bad_one(api_client):
    api_client.force_authenticate(user=UserFactory(role=UserRole.ADMIN))
    _purchase_order(PREORDER)

    for path in ("goods-receipts", "vendor-bills", "vendor-payments"):
        for kind in (STOCK, PREORDER):
            response = api_client.get(f"/api/v1/admin/procurement/{path}/?kind={kind}")
            assert response.status_code == 200, path
    assert api_client.get("/api/v1/admin/procurement/purchase-orders/?kind=x").status_code == 400
