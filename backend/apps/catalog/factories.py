from __future__ import annotations

from decimal import Decimal

import factory

from apps.accounts.factories import CustomerUserFactory
from apps.catalog.models import (
    BundleItem,
    Category,
    PriceIssueReport,
    Product,
    ProductImage,
    ProductQuestion,
    ProductReview,
    ProductVariant,
    WishlistItem,
)


class CategoryFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Category

    name = factory.Sequence(lambda n: f"Category {n}")
    slug = factory.Sequence(lambda n: f"category-{n}")
    parent = None
    description = ""


class ProductFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Product

    category = factory.SubFactory(CategoryFactory)
    name = factory.Sequence(lambda n: f"Product {n}")
    slug = factory.Sequence(lambda n: f"product-{n}")
    description = ""
    product_type = Product.ProductType.SIMPLE


class ProductVariantFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ProductVariant

    product = factory.SubFactory(ProductFactory)
    sku = factory.Sequence(lambda n: f"SKU-{n:06d}")
    barcode = ""
    price = Decimal("19.99")
    cost_price = Decimal("8.00")
    weight = None
    color = ""
    size = ""


class ProductImageFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ProductImage

    product = factory.SubFactory(ProductFactory)
    variant = None
    url = factory.Sequence(lambda n: f"https://example.com/image-{n}.jpg")
    sort_order = 0


class WishlistItemFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = WishlistItem

    customer = factory.SubFactory(CustomerUserFactory)
    product = factory.SubFactory(ProductFactory)


class ProductReviewFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ProductReview

    customer = factory.SubFactory(CustomerUserFactory)
    product = factory.SubFactory(ProductFactory)
    rating = 5
    comment = "Great product."
    is_verified_purchase = True


class BundleItemFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = BundleItem

    bundle_variant = factory.SubFactory(ProductVariantFactory)
    component_variant = factory.SubFactory(ProductVariantFactory)
    quantity = 1


class ProductQuestionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ProductQuestion

    customer = factory.SubFactory(CustomerUserFactory)
    product = factory.SubFactory(ProductFactory)
    question = factory.Sequence(lambda n: f"Is item {n} waterproof?")


class PriceIssueReportFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = PriceIssueReport

    reporter = factory.SubFactory(CustomerUserFactory)
    product = factory.SubFactory(ProductFactory)
    comment = "Listed higher than in store."
