from __future__ import annotations

import json
from pathlib import Path

import pytest
from django.core.management import call_command

from apps.catalog.management.commands.seed_catalog import SEED_DIR
from apps.catalog.models import Category, Product, ProductImage, ProductVariant
from apps.catalog.services.categories import create_category
from apps.catalog.services.products import create_product
from apps.inventory.models import StockItem

pytestmark = pytest.mark.django_db


def test_seed_catalog_replaces_everything(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    call_command("seed_chart_of_accounts")
    stale = create_category(name="Old demo")
    create_product(category=stale, name="Old product", price=10)

    call_command("seed_catalog", base_url="https://api.example.test", yes=True)

    items = json.loads((SEED_DIR / "catalog.json").read_text(encoding="utf-8"))
    assert Product.objects.count() == len(items)
    assert not Product.objects.filter(name="Old product").exists()
    assert not Category.objects.filter(name="Old demo").exists()

    kinds = {i["kind"] for i in items}
    assert kinds == {"stock", "preorder"}
    assert ProductVariant.objects.filter(is_preorder_enabled=True).count() == sum(
        i["kind"] == "preorder" for i in items
    )
    assert StockItem.objects.count() == sum(i["kind"] == "stock" for i in items)

    for image in ProductImage.objects.all():
        assert image.url.startswith("https://api.example.test/media/products/")
        assert (Path(tmp_path) / "products" / image.url.rsplit("/", 1)[1]).is_file()
    assert all(Product.objects.get(name=i["name"]).images.exists() for i in items)
