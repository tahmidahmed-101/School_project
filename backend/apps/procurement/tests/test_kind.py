from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from apps.accounts.constants import UserRole
from apps.accounts.factories import UserFactory
from apps.catalog.factories import ProductFactory, ProductVariantFactory
from apps.catalog.models import Category
from apps.common.exceptions import BusinessRuleViolationError
from apps.procurement.factories import SupplierFactory
from apps.procurement.services.purchase_orders import (
    add_purchase_order_line,
    create_purchase_order,
    update_purchase_order_line,
)

pytestmark = pytest.mark.django_db

STOCK = Category.CategoryType.STOCK
PREORDER = Category.CategoryType.PREORDER


def _variant(kind):
    return ProductVariantFactory(product=ProductFactory(category__category_type=kind))


def _line(variant):
    return {"variant": variant, "quantity_ordered": 5, "unit_cost": Decimal("10.00")}


def _purchase_order(kind):
    return create_purchase_order(
        supplier=SupplierFactory(), order_date=date.today(), lines=[_line(_variant(kind))]
    )


def test_a_purchase_order_cannot_mix_stock_and_preorder_items():
    with pytest.raises(BusinessRuleViolationError) as error:
        create_purchase_order(
            supplier=SupplierFactory(),
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


def test_the_only_line_of_a_purchase_order_may_change_kind():
    purchase_order = _purchase_order(STOCK)

    update_purchase_order_line(
        purchase_order=purchase_order,
        line=purchase_order.lines.get(),
        data={"variant": _variant(PREORDER)},
    )


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
