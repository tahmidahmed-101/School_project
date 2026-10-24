from __future__ import annotations

from decimal import Decimal

import pytest

from apps.catalog.factories import CategoryFactory, ProductVariantFactory, make_options
from apps.catalog.models import Product
from apps.catalog.selectors.products import get_product_by_slug, products_list
from apps.catalog.services.options import set_product_options
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


def test_adding_an_option_promotes_a_simple_product():
    product = _simple()

    set_product_options(
        product=product,
        options=[
            {
                "name": "Size",
                "default_value": "Small",
                "values": [{"value": "Small"}, {"value": "Large"}],
            }
        ],
    )
    large = product.options.get().values.get(value="Large")
    create_variant(
        product=product, sku="KETTLE-2", price=Decimal("210.00"), option_value_ids=[large.id]
    )

    product.refresh_from_db()
    assert product.product_type == Product.ProductType.VARIANT
    assert [variant.title for variant in product.variants.order_by("sku")] == ["Small", "Large"]


def test_a_product_without_options_refuses_a_second_variant():
    product = _simple()

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_variant(product=product, sku="KETTLE-2", price=Decimal("210.00"))
    assert exc.value.code == "variant_combination_exists"


def test_a_product_with_options_accepts_several_variants():
    product = create_product(category=CategoryFactory(), name="T-shirt")
    values = make_options(product, {"Size": ["S", "M"]})
    create_variant(
        product=product, sku="TEE-S", price=Decimal("10.00"), option_value_ids=[values["S"].id]
    )
    create_variant(
        product=product, sku="TEE-M", price=Decimal("10.00"), option_value_ids=[values["M"].id]
    )

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
    product = create_product(category=CategoryFactory(), name="Gone")
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


def test_update_product_price_sets_the_single_variant_of_a_product_without_options():
    from apps.catalog.services.products import update_product

    product = _simple()

    update_product(
        product=product,
        data={
            "price": Decimal("25.00"),
            "cost_price": Decimal("12.00"),
            "discount_price": Decimal("20.00"),
        },
    )

    variant = product.variants.get()
    assert variant.price == Decimal("25.00")
    assert variant.cost_price == Decimal("12.00")
    assert variant.discount_price == Decimal("20.00")


def test_update_product_price_leaves_the_variants_of_a_product_with_options_alone():
    from apps.catalog.services.products import update_product

    product = create_product(
        category=CategoryFactory(),
        name="Tee",
        price=Decimal("10.00"),
        options=[{"name": "Size", "values": ["S", "M"]}],
    )

    update_product(product=product, data={"price": Decimal("25.00"), "name": "Tee 2"})

    product.refresh_from_db()
    assert product.name == "Tee 2"
    assert {variant.price for variant in product.variants.all()} == {Decimal("10.00")}


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
    product = create_product(
        category=CategoryFactory(),
        name="Polo",
        price=Decimal("40.00"),
        cost_price=Decimal("22.00"),
        discount_price=Decimal("35.00"),
        options=[{"name": "Size", "values": ["M", "L"]}],
        combinations=[["M"]],
    )
    large = product.options.get().values.get(value="L")

    variation = create_variant(product=product, option_value_ids=[large.id])

    assert variation.price == Decimal("40.00")
    assert variation.cost_price == Decimal("22.00")
    assert variation.discount_price == Decimal("35.00")


def test_variation_without_price_needs_an_existing_variant():
    from apps.catalog.services.products import create_variant

    product = create_product(category=CategoryFactory(), name="Empty")
    with pytest.raises(BusinessRuleViolationError) as exc:
        create_variant(product=product)
    assert exc.value.code == "price_required"


def test_create_product_auto_generates_product_code():
    product = create_product(category=CategoryFactory(), name="Cotton Tee", price=Decimal("10.00"))
    assert product.product_code
    assert len(product.product_code) == 4
    assert product.product_code.isdigit()


def test_create_product_code_is_unique_across_similar_names():
    p1 = create_product(category=CategoryFactory(), name="Cotton Tee", price=Decimal("10.00"))
    p2 = create_product(category=CategoryFactory(), name="Cotton Tee", price=Decimal("12.00"))
    assert p1.product_code != p2.product_code
    assert len(p2.product_code) <= 4


def test_create_product_code_is_unique_against_soft_deleted():
    p1 = create_product(category=CategoryFactory(), name="Silk Scarf", price=Decimal("10.00"))
    p1_code = p1.product_code
    p1.soft_delete()
    p2 = create_product(category=CategoryFactory(), name="Silk Scarf", price=Decimal("12.00"))
    assert p2.product_code != p1_code


def test_product_code_is_exactly_four_digits():
    from apps.catalog.models import Product

    category = CategoryFactory()
    for name in ["Alpha", "Beta", "Gamma", "Delta"]:
        product = Product.objects.create(
            category=category, name=name, slug=f"product-{name.lower()}"
        )
        assert len(product.product_code) == 4
        assert product.product_code.isdigit()


def test_product_code_unique_across_all_products_including_deleted():
    from apps.catalog.models import Product

    category = CategoryFactory()
    codes = set()
    for i in range(20):
        product = Product.objects.create(
            category=category,
            name=f"Product {i}",
            slug=f"product-{i}",
        )
        assert product.product_code not in codes
        codes.add(product.product_code)

    # Soft-delete one and make sure a new product doesn't reuse its code
    first = Product.objects.first()
    first_code = first.product_code
    first.soft_delete()

    new_product = Product.objects.create(
        category=category, name="New Product", slug="product-new"
    )
    assert new_product.product_code != first_code
    assert new_product.product_code not in codes - {first_code}
