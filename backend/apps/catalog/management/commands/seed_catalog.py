from __future__ import annotations

import json
import shutil
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction
from django.utils import timezone

from apps.catalog.models import Brand, Category
from apps.catalog.selectors.sales import clear_live_sales_cache
from apps.catalog.services.brands import create_brand
from apps.catalog.services.categories import create_category
from apps.catalog.services.products import create_product, create_product_image, create_variant
from apps.inventory.services.stock import post_adjustment

SEED_DIR = Path(__file__).resolve().parents[2] / "seed_data"
COST_RATIO = Decimal("0.7")
PREORDER_WINDOW_DAYS = 30
PREORDER_RELEASE_DAYS = 45


class Command(BaseCommand):
    help = (
        "Replace the whole catalog with the curated products in apps/catalog/seed_data "
        "(stock and pre-order, with photos). Deletes every product, category, brand, "
        "stock row, order and purchase order first (users and settings stay)."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--base-url",
            required=True,
            help="Public origin the API serves /media/ from, e.g. https://api.kullmart.com",
        )
        parser.add_argument(
            "--yes", action="store_true", help="Confirm the catalog, orders and stock are wiped."
        )

    def handle(self, *args: Any, **options: Any) -> None:
        if not options["yes"]:
            raise CommandError("This deletes every product, order and stock row. Pass --yes.")
        items = json.loads((SEED_DIR / "catalog.json").read_text(encoding="utf-8"))
        media_url = f"{options['base_url'].rstrip('/')}{settings.MEDIA_URL}products/"
        media_dir = Path(settings.MEDIA_ROOT) / "products"
        media_dir.mkdir(parents=True, exist_ok=True)

        with transaction.atomic():
            call_command("reset_catalog_and_orders", apply=True, stdout=self.stdout)
            Category.objects.all().delete()
            Brand.objects.all().delete()
            clear_live_sales_cache()
            categories: dict[tuple[str, str], Category] = {}
            brands: dict[tuple[str, str], Any] = {}
            for item in items:
                self._seed_item(item, categories, brands, media_dir, media_url)
        self.stdout.write(self.style.SUCCESS(f"Seeded {len(items)} products."))

    def _seed_item(self, item, categories, brands, media_dir: Path, media_url: str) -> None:
        kind = item["kind"]
        category = categories.get((kind, item["category"]))
        if category is None:
            category = create_category(name=item["category"], category_type=kind)
            categories[(kind, item["category"])] = category
        brand = None
        if item["brand"]:
            brand = brands.get((kind, item["brand"]))
            if brand is None:
                brand = create_brand(name=item["brand"], kind=kind)
                brands[(kind, item["brand"])] = brand

        price = Decimal(item["price"])
        product = create_product(
            category=category,
            brand=brand,
            name=item["name"],
            description=item["description"],
            highlights=item["highlights"],
            specs=item["specs"],
        )
        if kind == Category.CategoryType.PREORDER:
            now = timezone.now()
            variant = create_variant(
                product=product,
                sku=item["sku"],
                price=price,
                cost_price=(price * COST_RATIO).quantize(Decimal("0.01")),
                is_preorder_enabled=True,
                preorder_price=Decimal(item["preorder_price"]),
                preorder_start_date=now,
                preorder_end_date=now + timedelta(days=PREORDER_WINDOW_DAYS),
                release_date=now + timedelta(days=PREORDER_RELEASE_DAYS),
                preorder_stock_limit=item["stock"],
            )
        else:
            discount = item["discount_price"]
            variant = create_variant(
                product=product,
                sku=item["sku"],
                price=price,
                cost_price=(price * COST_RATIO).quantize(Decimal("0.01")),
                discount_price=Decimal(discount) if discount else None,
            )
            post_adjustment(
                variant=variant,
                quantity_delta=item["stock"],
                unit_cost=variant.cost_price,
                notes="Opening stock",
            )

        for order, name in enumerate(item["images"]):
            shutil.copyfile(SEED_DIR / "images" / name, media_dir / name)
            create_product_image(
                product=product,
                url=f"{media_url}{name}",
                alt_text=item["name"],
                sort_order=order,
            )
