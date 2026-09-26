from __future__ import annotations

from decimal import Decimal

import pytest

from apps.catalog.factories import CategoryFactory, ProductVariantFactory
from apps.catalog.models import Product
from apps.catalog.selectors.products import get_product_by_slug, products_list
from apps.catalog.services.products import create_product, create_variant
from apps.common.exceptions import BusinessRuleViolationError

pytestmark = pytest.mark.django_db


def _simple(price=Decimal("199.00")):
    return create_product(category=CategoryFactory(), name="Kettle", price=price, sku="KETTLE-1")


def test_a_price_creates_the_products_single_variant():
    product = _simple()

    variant = product.variants.get()
    assert variant.sku == "KETTLE-1"
    assert variant.price == Decimal("199.00")


def test_sku_defaults_from_the_slug():
    product = create_product(category=CategoryFactory(), name="Steel Flask", price=Decimal("50.00"))
    assert product.variants.get().sku == product.slug.upper()


def test_no_variant_is_created_without_a_price():
    product = create_product(category=CategoryFactory(), name="Draft item")
    assert product.variants.count() == 0


def test_a_second_variant_promotes_a_simple_product():
    product = _simple()

    create_variant(product=product, sku="KETTLE-2", price=Decimal("210.00"), size="Large")

    product.refresh_from_db()
    assert product.product_type == Product.ProductType.VARIANT
    assert product.variants.count() == 2


def test_a_simple_product_refuses_a_second_variant_with_the_same_combo():
    product = _simple()

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_variant(product=product, sku="KETTLE-2", price=Decimal("210.00"))
    assert exc.value.code == "duplicate_variant_combo"


def test_a_variant_product_accepts_several():
    product = create_product(
        category=CategoryFactory(),
        name="T-shirt",
        product_type=Product.ProductType.VARIANT,
    )
    create_variant(product=product, sku="TEE-S", price=Decimal("10.00"), size="S")
    create_variant(product=product, sku="TEE-M", price=Decimal("10.00"), size="M")

    assert product.variants.count() == 2


def test_a_product_with_no_variant_is_not_sellable():
    create_product(category=CategoryFactory(), name="Priceless")

    assert products_list(sellable_only=True).count() == 0
    assert products_list().count() == 1


def test_a_priced_product_is_sellable():
    product = _simple()

    assert list(products_list(sellable_only=True)) == [product]
    assert get_product_by_slug(product.slug) == product


def test_the_public_page_404s_a_product_with_no_live_variant():
    product = _simple()
    product.variants.update(is_active=False)

    assert get_product_by_slug(product.slug) is None


def test_a_deleted_variant_does_not_keep_a_product_sellable():
    product = create_product(
        category=CategoryFactory(), name="Gone", product_type=Product.ProductType.VARIANT
    )
    variant = ProductVariantFactory(product=product)
    variant.soft_delete()

    assert products_list(sellable_only=True).count() == 0


def test_create_product_stores_cost_and_discount_on_the_variant():
    product = create_product(
        category=CategoryFactory(),
        name="Priced Kettle",
        price=Decimal("199.00"),
        cost_price=Decimal("120.00"),
        discount_price=Decimal("179.00"),
    )
    variant = product.variants.get()
    assert variant.cost_price == Decimal("120.00")
    assert variant.discount_price == Decimal("179.00")


def test_update_product_price_fans_out_to_all_variants():
    from apps.catalog.services.products import create_variant, update_product

    product = create_product(
        category=CategoryFactory(),
        name="Tee",
        product_type=Product.ProductType.VARIANT,
    )
    create_variant(product=product, sku="TEE-A", price=Decimal("10.00"), size="S")
    create_variant(product=product, sku="TEE-B", price=Decimal("10.00"), size="M")

    update_product(
        product=product,
        data={
            "price": Decimal("25.00"),
            "cost_price": Decimal("12.00"),
            "discount_price": Decimal("20.00"),
        },
    )

    for variant in product.variants.all():
        assert variant.price == Decimal("25.00")
        assert variant.cost_price == Decimal("12.00")
        assert variant.discount_price == Decimal("20.00")


def test_update_product_price_creates_a_variant_when_none_exists():
    from apps.catalog.services.products import update_product

    product = create_product(category=CategoryFactory(), name="Bare Combo")
    assert product.variants.count() == 0

    update_product(
        product=product,
        data={"price": Decimal("1090.00"), "cost_price": Decimal("600.00")},
    )

    variant = product.variants.get()
    assert variant.price == Decimal("1090.00")
    assert variant.cost_price == Decimal("600.00")


def test_product_serializer_exposes_representative_pricing():
    from api.v1.admin.catalog.serializers import ProductSerializer
    from apps.catalog.selectors.products import get_product_by_id

    product = create_product(
        category=CategoryFactory(),
        name="Priced Item",
        price=Decimal("199.00"),
        cost_price=Decimal("120.00"),
        discount_price=Decimal("179.00"),
    )
    data = ProductSerializer(get_product_by_id(product.id)).data
    assert data["price"] == "199.00"
    assert data["cost_price"] == "120.00"
    assert data["discount_price"] == "179.00"


def test_adding_a_variation_inherits_pricing_from_sibling():
    from apps.catalog.services.products import create_variant

    product = create_product(
        category=CategoryFactory(),
        name="Polo",
        product_type=Product.ProductType.VARIANT,
        price=Decimal("40.00"),
        cost_price=Decimal("22.00"),
        discount_price=Decimal("35.00"),
    )
    variation = create_variant(product=product, color="Blue", size="L")
    assert variation.price == Decimal("40.00")
    assert variation.cost_price == Decimal("22.00")
    assert variation.discount_price == Decimal("35.00")


def test_variation_without_price_needs_an_existing_variant():
    from apps.catalog.services.products import create_variant

    product = create_product(category=CategoryFactory(), name="Empty")
    with pytest.raises(BusinessRuleViolationError) as exc:
        create_variant(product=product, color="Red")
    assert exc.value.code == "price_required"
