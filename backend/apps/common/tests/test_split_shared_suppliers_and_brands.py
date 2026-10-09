from __future__ import annotations

from io import StringIO

import pytest
from django.core.management import call_command

from apps.catalog.factories import ProductFactory, ProductVariantFactory
from apps.catalog.models import Brand, Category
from apps.procurement.factories import (
    PurchaseOrderFactory,
    PurchaseOrderLineFactory,
    SupplierFactory,
    VendorBillFactory,
)
from apps.procurement.models import Supplier

pytestmark = pytest.mark.django_db

STOCK = Category.CategoryType.STOCK
PREORDER = Category.CategoryType.PREORDER
COMMAND = "split_shared_suppliers_and_brands"


def _run(*args) -> str:
    out = StringIO()
    call_command(COMMAND, *args, stdout=out)
    return out.getvalue()


def _brand(name: str) -> Brand:
    return Brand.objects.create(name=name, slug=name.lower())


def _product(kind, brand):
    return ProductFactory(category__category_type=kind, brand=brand)


def _purchase_order(kind, supplier):
    purchase_order = PurchaseOrderFactory(supplier=supplier)
    PurchaseOrderLineFactory(
        purchase_order=purchase_order,
        variant=ProductVariantFactory(product__category__category_type=kind),
    )
    return purchase_order


def test_dry_run_reports_and_writes_nothing():
    shared = _brand("Shared")
    _product(STOCK, shared)
    _product(PREORDER, shared)
    supplier = SupplierFactory(name="Both")
    _purchase_order(STOCK, supplier)
    _purchase_order(PREORDER, supplier)

    output = _run()

    assert "Brand 'Shared': would move 1 preorder product(s)" in output
    assert "Supplier 'Both': would move 1 preorder purchase order(s) and 0 bill(s)" in output
    assert "2 row(s) would change. Dry run; nothing written." in output
    assert Brand.objects.count() == 1
    assert Supplier.objects.count() == 1


def test_brands_get_their_kind_from_use_and_a_shared_brand_is_copied():
    unused = _brand("Unused")
    stock_only = _brand("StockOnly")
    preorder_only = _brand("PreorderOnly")
    shared = _brand("Shared")
    _product(STOCK, stock_only)
    _product(PREORDER, preorder_only)
    stock_product = _product(STOCK, shared)
    preorder_product = _product(PREORDER, shared)

    output = _run("--apply")

    assert "2 row(s) changed." in output
    for brand in (unused, stock_only, preorder_only, shared):
        brand.refresh_from_db()
    assert (unused.kind, stock_only.kind, shared.kind) == (STOCK, STOCK, STOCK)
    assert preorder_only.kind == PREORDER
    copy = Brand.objects.get(name="Shared", kind=PREORDER)
    assert copy.slug not in ("", shared.slug)
    stock_product.refresh_from_db()
    preorder_product.refresh_from_db()
    assert stock_product.brand == shared
    assert preorder_product.brand == copy
    assert "0 row(s) would change" in _run()


def test_suppliers_get_their_kind_from_use_and_a_shared_supplier_is_copied():
    unused = SupplierFactory()
    preorder_only = SupplierFactory()
    shared = SupplierFactory(name="Both", phone="01700000000")
    _purchase_order(PREORDER, preorder_only)
    stock_order = _purchase_order(STOCK, shared)
    preorder_order = _purchase_order(PREORDER, shared)
    stock_bill = VendorBillFactory(purchase_order=stock_order, supplier=shared)
    preorder_bill = VendorBillFactory(purchase_order=preorder_order, supplier=shared)

    output = _run("--apply")

    assert "2 row(s) changed." in output
    for row in (unused, preorder_only, shared, stock_order, preorder_order):
        row.refresh_from_db()
    stock_bill.refresh_from_db()
    preorder_bill.refresh_from_db()
    assert (unused.kind, shared.kind, preorder_only.kind) == (STOCK, STOCK, PREORDER)
    copy = Supplier.objects.get(name="Both", kind=PREORDER)
    assert (copy.phone, copy.contact_email) == (shared.phone, shared.contact_email)
    assert (stock_order.supplier, stock_bill.supplier) == (shared, shared)
    assert (preorder_order.supplier, preorder_bill.supplier) == (copy, copy)
    assert "0 row(s) would change" in _run()


def test_a_preorder_brand_with_the_same_name_is_reused_instead_of_copied():
    shared = _brand("Shared")
    existing = Brand.objects.create(name="Shared", slug="shared-2", kind=PREORDER)
    product = _product(PREORDER, shared)

    _run("--apply")

    product.refresh_from_db()
    assert product.brand == existing
    assert Brand.objects.filter(name="Shared").count() == 2
