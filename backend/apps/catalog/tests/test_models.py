from __future__ import annotations

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from apps.catalog.factories import CategoryFactory, ProductFactory, ProductVariantFactory
from apps.catalog.models import ProductImage

pytestmark = pytest.mark.django_db


def test_category_soft_delete_sets_deleted_at():
    category = CategoryFactory()

    category.soft_delete()

    assert category.is_deleted
    assert category.deleted_at is not None


def test_product_variant_sku_must_be_unique():
    ProductVariantFactory(sku="SKU-DUP")

    with pytest.raises(IntegrityError), transaction.atomic():
        ProductVariantFactory(sku="SKU-DUP")


def test_product_image_requires_exactly_one_of_product_or_variant():
    product = ProductFactory()
    variant = ProductVariantFactory(product=product)

    with pytest.raises(ValidationError):
        ProductImage(product=product, variant=variant, url="https://example.com/x.jpg").clean()

    with pytest.raises(ValidationError):
        ProductImage(url="https://example.com/x.jpg").clean()

    ProductImage(product=product, url="https://example.com/x.jpg").clean()
