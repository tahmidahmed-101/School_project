from __future__ import annotations

import io
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import (
    CategoryFactory,
    ProductFactory,
    ProductVariantFactory,
)
from apps.catalog.models import Category, Product, ProductVariant
from apps.catalog.services.categories import create_category, delete_category, update_category
from apps.catalog.services.products import (
    create_product,
    create_variant,
    deactivate_product,
    update_variant,
)
from apps.catalog.services.variant_import_export import export_variants, import_variants
from apps.catalog.services.variants import generate_variants
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.orders.models import SalesOrder
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout

pytestmark = pytest.mark.django_db


def test_create_category_generates_unique_slug():
    first = create_category(name="Shoes")
    second = create_category(name="Shoes")

    assert first.slug == "shoes"
    assert second.slug == "shoes-2"


def test_delete_category_rejects_when_children_exist():
    parent = CategoryFactory()
    CategoryFactory(parent=parent)

    with pytest.raises(BusinessRuleViolationError):
        delete_category(category=parent)


def test_create_category_defaults_to_stock_type():
    category = create_category(name="Shoes Root")

    assert category.category_type == Category.CategoryType.STOCK


def test_create_category_accepts_explicit_preorder_type():
    category = create_category(name="Upcoming Drops", category_type=Category.CategoryType.PREORDER)

    assert category.category_type == Category.CategoryType.PREORDER


def test_create_subcategory_inherits_parent_type():
    parent = CategoryFactory(category_type=Category.CategoryType.PREORDER)

    child = create_category(name="Pre-order Sneakers", parent=parent)

    assert child.category_type == Category.CategoryType.PREORDER


def test_create_subcategory_rejects_mismatched_explicit_type():
    parent = CategoryFactory(category_type=Category.CategoryType.STOCK)

    with pytest.raises(BusinessRuleViolationError) as exc_info:
        create_category(
            name="Mismatched",
            parent=parent,
            category_type=Category.CategoryType.PREORDER,
        )
    assert exc_info.value.code == "category_type_mismatch"


def test_update_category_rejects_direct_type_change_on_subcategory():
    parent = CategoryFactory(category_type=Category.CategoryType.STOCK)
    child = CategoryFactory(parent=parent, category_type=Category.CategoryType.STOCK)

    with pytest.raises(BusinessRuleViolationError) as exc_info:
        update_category(category=child, data={"category_type": Category.CategoryType.PREORDER})
    assert exc_info.value.code == "category_type_locked_to_parent"


def test_update_category_type_cascades_to_descendants():
    root = CategoryFactory(category_type=Category.CategoryType.STOCK)
    child = CategoryFactory(parent=root, category_type=Category.CategoryType.STOCK)
    grandchild = CategoryFactory(parent=child, category_type=Category.CategoryType.STOCK)

    update_category(category=root, data={"category_type": Category.CategoryType.PREORDER})

    child.refresh_from_db()
    grandchild.refresh_from_db()
    assert child.category_type == Category.CategoryType.PREORDER
    assert grandchild.category_type == Category.CategoryType.PREORDER


def test_update_category_reparent_adopts_new_parent_type():
    stock_root = CategoryFactory(category_type=Category.CategoryType.STOCK)
    preorder_root = CategoryFactory(category_type=Category.CategoryType.PREORDER)
    moved = CategoryFactory(parent=stock_root, category_type=Category.CategoryType.STOCK)

    updated = update_category(category=moved, data={"parent": preorder_root})

    assert updated.category_type == Category.CategoryType.PREORDER


def test_create_product_and_variant_duplicate_sku_rejected():
    category = CategoryFactory()
    product = create_product(category=category, name="T-Shirt")

    create_variant(product=product, sku="TSHIRT-BLU-L", price=Decimal("19.99"))

    with pytest.raises(BusinessRuleViolationError):
        create_variant(product=product, sku="TSHIRT-BLU-L", price=Decimal("19.99"))


def test_deactivate_product_deactivates_its_variants():
    product = ProductFactory()
    variant = create_variant(product=product, sku="DEACT-1", price=Decimal("9.99"))

    deactivate_product(product=product)

    variant.refresh_from_db()
    assert variant.is_active is False


def test_create_variant_generates_a_sku_from_the_product_slug_and_combo():
    product = ProductFactory(name="Panjabi Classic", slug="panjabi-classic")

    variant = create_variant(product=product, price=Decimal("1200"), color="Navy", size="L")

    assert variant.sku == "PANJABI-CLASSIC-NAVY-L"


def test_create_variant_suffixes_a_generated_sku_that_is_already_taken():
    ProductVariantFactory(sku="PANJABI-CLASSIC-NAVY-L")
    product = ProductFactory(name="Panjabi Classic", slug="panjabi-classic")

    variant = create_variant(product=product, price=Decimal("1200"), color="Navy", size="L")

    assert variant.sku == "PANJABI-CLASSIC-NAVY-L-2"


def test_create_variant_rejects_a_repeated_colour_and_size_on_the_same_product():
    product = ProductFactory(product_type=Product.ProductType.VARIANT)
    create_variant(product=product, price=Decimal("950"), color="Black", size="M")

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_variant(product=product, price=Decimal("950"), color="Black", size="M")

    assert exc.value.code == "duplicate_variant_combo"


def test_create_variant_allows_the_same_colour_and_size_on_another_product():
    first = ProductFactory()
    second = ProductFactory()
    create_variant(product=first, price=Decimal("950"), color="Black", size="M")

    variant = create_variant(product=second, price=Decimal("950"), color="Black", size="M")

    assert variant.pk is not None


def test_create_variant_allows_a_combo_freed_by_a_soft_delete():
    product = ProductFactory(product_type=Product.ProductType.VARIANT)
    first = create_variant(product=product, price=Decimal("950"), color="Black", size="M")

    first.soft_delete()
    replacement = create_variant(product=product, price=Decimal("990"), color="Black", size="M")

    assert replacement.pk != first.pk


def test_generate_variants_creates_cartesian_product_and_skips_existing():
    product = ProductFactory(
        name="Nike T-Shirt", slug="nike-t-shirt", product_type=Product.ProductType.VARIANT
    )
    existing = create_variant(
        product=product, sku="EXISTING-RED-S", price=Decimal("10"), color="Red", size="S"
    )

    result = generate_variants(
        product=product,
        colors=["Red", "Blue"],
        sizes=["S", "L"],
        price=Decimal("25.00"),
    )

    assert {(variant.color, variant.size) for variant in result.created} == {
        ("Red", "L"),
        ("Blue", "S"),
        ("Blue", "L"),
    }
    assert result.skipped_existing == [existing]
    assert result.stale == []
    assert product.variants.count() == 4


def test_generate_variants_reports_combinations_outside_the_selection_as_stale():
    product = ProductFactory(product_type=Product.ProductType.VARIANT)
    dropped = create_variant(product=product, price=Decimal("10"), color="Red", size="S")

    result = generate_variants(
        product=product, colors=["Blue"], sizes=["S"], price=Decimal("25.00")
    )

    assert result.stale == [dropped]
    dropped.refresh_from_db()
    assert dropped.deleted_at is None


def test_generate_variants_with_colours_only_leaves_size_blank():
    product = ProductFactory(product_type=Product.ProductType.VARIANT)

    result = generate_variants(
        product=product, colors=["Black", "Brown", "Navy"], sizes=[], price=Decimal("450")
    )

    assert [(variant.color, variant.size) for variant in result.created] == [
        ("Black", ""),
        ("Brown", ""),
        ("Navy", ""),
    ]


def test_generate_variants_with_sizes_only_leaves_colour_blank():
    product = ProductFactory(product_type=Product.ProductType.VARIANT)

    result = generate_variants(
        product=product, colors=[], sizes=["S", "M", "L", "XL"], price=Decimal("1450")
    )

    assert [(variant.color, variant.size) for variant in result.created] == [
        ("", "S"),
        ("", "M"),
        ("", "L"),
        ("", "XL"),
    ]


def test_generate_variants_rejects_an_empty_colour_and_size_selection():
    product = ProductFactory()

    with pytest.raises(BusinessRuleViolationError) as exc:
        generate_variants(product=product, colors=[], sizes=[], price=Decimal("10"))

    assert exc.value.code == "no_variant_axes"


def test_export_then_import_variants_round_trip():
    product = ProductFactory(name="Roundtrip Product")
    variant = ProductVariantFactory(
        product=product, sku="ROUNDTRIP-1", price=Decimal("12.50"), cost_price=Decimal("5.00")
    )

    csv_bytes = export_variants(ProductVariant.objects.filter(id=variant.id), fmt="csv")

    variant.price = Decimal("99.99")
    variant.save(update_fields=["price"])

    result = import_variants(file=io.BytesIO(csv_bytes), fmt="csv")

    assert result.errors == []
    assert result.updated == 1
    variant.refresh_from_db()
    assert variant.price == Decimal("12.50")


def test_export_variants_carries_colour_and_size_columns():
    product = ProductFactory(name="Muffler Product")
    variant = ProductVariantFactory(product=product, sku="MUF-1", color="Navy", size="Free")

    csv_text = export_variants(ProductVariant.objects.filter(id=variant.id), fmt="csv").decode(
        "utf-8"
    )

    header, row = csv_text.splitlines()[:2]
    assert header.split(",")[8:10] == ["color", "size"]
    assert row.split(",")[8:10] == ["Navy", "Free"]


def test_import_variants_reports_row_errors_without_aborting():
    good_product = ProductFactory(name="Good Product")
    csv_content = (
        "product_name,sku,barcode,price,cost_price,discount_price,stock,weight,"
        "color,size,is_active\n"
        "Nonexistent Product,BAD-SKU,,10,5,,0,,,,1\n"
        f"{good_product.name},GOOD-SKU,,10,5,,0,,Black,M,1\n"
    )

    result = import_variants(file=io.BytesIO(csv_content.encode("utf-8")), fmt="csv")

    assert result.created == 1
    assert len(result.errors) == 1
    assert result.errors[0]["sku"] == "BAD-SKU"


# Pre-order tests


def test_create_variant_with_preorder_fields():
    """Test creating a variant with pre-order fields."""
    product = ProductFactory()
    now = timezone.now()

    variant = create_variant(
        product=product,
        price=Decimal("1000"),
        is_preorder_enabled=True,
        preorder_price=Decimal("900"),
        preorder_start_date=now - timedelta(days=1),
        preorder_end_date=now + timedelta(days=30),
        release_date=now + timedelta(days=31),
        preorder_stock_limit=100,
    )

    assert variant.is_preorder_enabled is True
    assert variant.preorder_price == Decimal("900")
    assert variant.preorder_stock_limit == 100
    assert variant.is_preorder_active is True


def test_create_variant_preorder_price_must_be_lower_than_normal_price():
    """Test that preorder_price must be lower than normal price."""
    product = ProductFactory()
    now = timezone.now()

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_variant(
            product=product,
            price=Decimal("1000"),
            is_preorder_enabled=True,
            preorder_price=Decimal("1000"),  # Same as price - should fail
            preorder_start_date=now - timedelta(days=1),
            preorder_end_date=now + timedelta(days=30),
            release_date=now + timedelta(days=31),
        )

    assert exc.value.code == "preorder_price_must_be_lower"


def test_create_variant_preorder_dates_validation():
    """Test pre-order date validation."""
    product = ProductFactory()
    now = timezone.now()

    # preorder_end_date before preorder_start_date should fail
    with pytest.raises(BusinessRuleViolationError) as exc:
        create_variant(
            product=product,
            price=Decimal("1000"),
            is_preorder_enabled=True,
            preorder_price=Decimal("900"),
            preorder_start_date=now + timedelta(days=10),
            preorder_end_date=now + timedelta(days=5),  # Before start
            release_date=now + timedelta(days=31),
        )

    assert exc.value.code == "preorder_end_date_before_start"


def test_create_variant_release_date_before_preorder_end():
    """Test that release_date must be on or after preorder_end_date."""
    product = ProductFactory()
    now = timezone.now()

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_variant(
            product=product,
            price=Decimal("1000"),
            is_preorder_enabled=True,
            preorder_price=Decimal("900"),
            preorder_start_date=now - timedelta(days=1),
            preorder_end_date=now + timedelta(days=30),
            release_date=now + timedelta(days=15),  # Before preorder_end_date
        )

    assert exc.value.code == "release_date_before_preorder_end"


def test_preorder_not_active_when_dates_not_set():
    """Test that pre-order is not active when dates are not set."""
    product = ProductFactory()

    variant = create_variant(
        product=product,
        price=Decimal("1000"),
        is_preorder_enabled=True,
        preorder_price=Decimal("900"),
        # No dates set
    )

    assert variant.is_preorder_active is False
    assert variant.can_preorder is False


def test_preorder_not_active_when_dates_in_past():
    """Test that pre-order is not active when dates are in the past."""
    product = ProductFactory()
    now = timezone.now()

    variant = create_variant(
        product=product,
        price=Decimal("1000"),
        is_preorder_enabled=True,
        preorder_price=Decimal("900"),
        preorder_start_date=now - timedelta(days=60),
        preorder_end_date=now - timedelta(days=30),
        release_date=now - timedelta(days=15),
    )

    assert variant.is_preorder_active is False
    assert variant.can_preorder is False


def test_preorder_not_active_when_dates_in_future():
    """Test that pre-order is not active when dates are in the future."""
    product = ProductFactory()
    now = timezone.now()

    variant = create_variant(
        product=product,
        price=Decimal("1000"),
        is_preorder_enabled=True,
        preorder_price=Decimal("900"),
        preorder_start_date=now + timedelta(days=10),
        preorder_end_date=now + timedelta(days=30),
        release_date=now + timedelta(days=31),
    )

    assert variant.is_preorder_active is False
    assert variant.can_preorder is False


def test_preorder_active_when_within_date_range():
    """Test that pre-order is active when within date range."""
    product = ProductFactory()
    now = timezone.now()

    variant = create_variant(
        product=product,
        price=Decimal("1000"),
        is_preorder_enabled=True,
        preorder_price=Decimal("900"),
        preorder_start_date=now - timedelta(days=10),
        preorder_end_date=now + timedelta(days=10),
        release_date=now + timedelta(days=15),
    )

    assert variant.is_preorder_active is True
    assert variant.can_preorder is True


def test_effective_price_uses_preorder_price_when_active():
    """Test that effective_price returns preorder_price when pre-order is active."""
    product = ProductFactory()
    now = timezone.now()

    variant = create_variant(
        product=product,
        price=Decimal("1000"),
        is_preorder_enabled=True,
        preorder_price=Decimal("900"),
        preorder_start_date=now - timedelta(days=10),
        preorder_end_date=now + timedelta(days=10),
        release_date=now + timedelta(days=15),
    )

    assert variant.effective_price == Decimal("900")
    assert variant.is_preorder_price_applied is True


def test_effective_price_falls_back_to_discount_price_when_preorder_inactive():
    """Test that effective_price falls back to discount_price when pre-order inactive."""
    product = ProductFactory()
    now = timezone.now()

    variant = create_variant(
        product=product,
        price=Decimal("1000"),
        discount_price=Decimal("950"),
        is_preorder_enabled=True,
        preorder_price=Decimal("900"),
        preorder_start_date=now - timedelta(days=60),
        preorder_end_date=now - timedelta(days=30),  # Pre-order ended
        release_date=now - timedelta(days=15),
    )

    assert variant.effective_price == Decimal("950")
    assert variant.is_preorder_price_applied is False


def test_can_preorder_checks_stock_limit():
    """Test that can_preorder returns False when preorder stock limit reached."""
    product = ProductFactory()
    now = timezone.now()

    variant = create_variant(
        product=product,
        price=Decimal("1000"),
        is_preorder_enabled=True,
        preorder_price=Decimal("900"),
        preorder_start_date=now - timedelta(days=10),
        preorder_end_date=now + timedelta(days=10),
        release_date=now + timedelta(days=15),
        preorder_stock_limit=5,
    )

    # First order within limit
    customer = create_user(email="test1@example.com", role=UserRole.CUSTOMER)
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=3)

    variant.refresh_from_db()
    assert variant.can_preorder is True

    # Second order reaches limit
    add_line(order=cart, variant=variant, quantity=2)

    variant.refresh_from_db()
    assert variant.can_preorder is False


def test_preorder_stock_limit_enforced_at_cart():
    """Test that pre-order stock limit is enforced when adding to cart."""
    product = ProductFactory()
    now = timezone.now()

    variant = create_variant(
        product=product,
        price=Decimal("1000"),
        is_preorder_enabled=True,
        preorder_price=Decimal("900"),
        preorder_start_date=now - timedelta(days=10),
        preorder_end_date=now + timedelta(days=10),
        release_date=now + timedelta(days=15),
        preorder_stock_limit=5,
    )

    customer = create_user(email="test2@example.com", role=UserRole.CUSTOMER)
    cart = get_or_create_cart(customer)

    # Add within limit
    add_line(order=cart, variant=variant, quantity=3)
    assert cart.lines.first().quantity == 3

    # Add more - should fail
    with pytest.raises(BusinessRuleViolationError) as exc:
        add_line(order=cart, variant=variant, quantity=3)  # Would exceed limit

    assert exc.value.code == "preorder_stock_exceeded"


def test_preorder_not_available_when_disabled():
    """Test that pre-order is not available when disabled."""
    product = ProductFactory()
    now = timezone.now()

    variant = create_variant(
        product=product,
        price=Decimal("1000"),
        is_preorder_enabled=False,  # Disabled
        preorder_price=Decimal("900"),
        preorder_start_date=now - timedelta(days=10),
        preorder_end_date=now + timedelta(days=10),
        release_date=now + timedelta(days=15),
    )

    assert variant.is_preorder_active is False
    assert variant.can_preorder is False


def test_preorder_expired_rejected_at_checkout():
    """Test that expired pre-order is rejected at checkout."""
    product = ProductFactory()
    now = timezone.now()

    variant = create_variant(
        product=product,
        price=Decimal("1000"),
        is_preorder_enabled=True,
        preorder_price=Decimal("900"),
        preorder_start_date=now - timedelta(days=60),
        preorder_end_date=now - timedelta(days=30),  # Expired
        release_date=now - timedelta(days=15),
    )

    customer = create_user(email="test@example.com", role=UserRole.CUSTOMER)
    cart = get_or_create_cart(customer)

    # Add line should fail because pre-order is expired
    with pytest.raises(BusinessRuleViolationError) as exc:
        add_line(order=cart, variant=variant, quantity=1)

    assert exc.value.code == "preorder_not_active"


def test_update_variant_preorder_fields():
    """Test updating pre-order fields on existing variant."""
    product = ProductFactory()
    now = timezone.now()

    variant = create_variant(product=product, price=Decimal("1000"))
    assert variant.is_preorder_enabled is False

    # Update to enable pre-order
    variant = update_variant(
        variant=variant,
        data={
            "is_preorder_enabled": True,
            "preorder_price": Decimal("900"),
            "preorder_start_date": now - timedelta(days=1),
            "preorder_end_date": now + timedelta(days=30),
            "release_date": now + timedelta(days=31),
            "preorder_stock_limit": 50,
        },
    )

    assert variant.is_preorder_enabled is True
    assert variant.preorder_price == Decimal("900")
    assert variant.preorder_stock_limit == 50


def test_normal_product_order_still_works():
    """Test that normal product order (non-preorder) still works."""
    product = ProductFactory()
    variant = ProductVariantFactory(product=product, price=Decimal("1000"))

    # Add stock so checkout can reserve it
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=10,
        unit_cost=Decimal("5.00"),
    )

    customer = create_user(email="test3@example.com", role=UserRole.CUSTOMER)
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=2)

    assert cart.lines.first().unit_price == Decimal("1000")
    assert cart.lines.first().is_preorder is False

    # Checkout should work
    order = checkout(order=cart)
    assert order.status == SalesOrder.Status.AWAITING_PAYMENT


def test_preorder_checkout_works_with_zero_inventory_stock():
    """Test that pre-order checkout works even when product has zero inventory stock."""
    from apps.orders.services.checkout import checkout

    product = ProductFactory()
    now = timezone.now()

    variant = create_variant(
        product=product,
        price=Decimal("1000"),
        is_preorder_enabled=True,
        preorder_price=Decimal("900"),
        preorder_start_date=now - timedelta(days=10),
        preorder_end_date=now + timedelta(days=10),
        release_date=now + timedelta(days=15),
        preorder_stock_limit=100,
    )

    customer = create_user(email="preorder@example.com", role=UserRole.CUSTOMER)
    cart = get_or_create_cart(customer)
    add_line(order=cart, variant=variant, quantity=3)

    # Verify pre-order price is used
    assert cart.lines.first().unit_price == Decimal("900")
    assert cart.lines.first().is_preorder is True

    # Checkout should work even with zero inventory stock
    order = checkout(order=cart)
    assert order.status == SalesOrder.Status.AWAITING_PAYMENT
    assert order.grand_total == Decimal("2700")  # 900 * 3
