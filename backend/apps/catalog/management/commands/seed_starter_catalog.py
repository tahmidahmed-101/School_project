from __future__ import annotations

import shutil
from decimal import Decimal
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

from apps.catalog.models import Category, Product, ProductImage
from apps.catalog.services.bundles import create_bundle
from apps.catalog.services.products import create_product, create_variant
from apps.inventory.services.stock import stock_intake

SEED_ASSETS = Path(__file__).resolve().parents[2] / "seed_assets"
MEDIA_SUBDIR = "products"

PRODUCTS: list[dict[str, Any]] = [
    {
        "name": "Classic Leather Belt",
        "sku": "BELT-CLASSIC",
        "price": Decimal("1200.00"),
        "cost_price": Decimal("700.00"),
        "quantity": 25,
        "image": "belt-1.jpg",
        "description": (
            "A full-grain leather belt with a brushed steel buckle, cut to hold its shape "
            "through daily wear."
        ),
        "highlights": ["Full-grain leather", "Brushed steel buckle", "Hand-finished edges"],
    },
    {
        "name": "Formal Black Belt",
        "sku": "BELT-FORMAL",
        "price": Decimal("950.00"),
        "cost_price": Decimal("550.00"),
        "quantity": 40,
        "image": "belt-2.jpg",
        "description": "A slim black belt with a smooth finish, sized to sit cleanly under a suit.",
        "highlights": ["Slim 30mm width", "Matte black finish", "Reinforced stitching"],
    },
    {
        "name": "Casual Textured Belt",
        "sku": "BELT-CASUAL",
        "price": Decimal("700.00"),
        "cost_price": Decimal("400.00"),
        "quantity": 30,
        "image": "belt-3.jpg",
        "description": "A textured-grain belt built for denim and chinos, with a matte buckle.",
        "highlights": ["Textured grain", "Matte buckle", "Everyday build"],
    },
]

BUNDLE = {
    "name": "Everyday Belt Duo",
    "sku": "COMBO-BELT-DUO",
    "price": Decimal("1900.00"),
    "description": "The Classic and Formal belts together — one for the week, one for the office.",
    "components": ["BELT-CLASSIC", "BELT-FORMAL"],
}


class Command(BaseCommand):
    help = "Seed 3 products and 1 combo with real images. Run after reset_catalog_and_orders."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--base-url",
            default="http://localhost:8000",
            help="Public origin that serves /media/ (e.g. https://api.simpleadmin.com).",
        )
        parser.add_argument("--category", default="Belt", help="Category name to file these under.")

    def _store_image(self, filename: str, base_url: str) -> str:
        """Copies a bundled asset into MEDIA_ROOT and returns its absolute URL.
        Absolute and on the API origin so the same value renders in the admin
        (plain <img>) and the storefront (next/image remotePatterns)."""
        source = SEED_ASSETS / filename
        target_dir = Path(settings.MEDIA_ROOT) / MEDIA_SUBDIR
        target_dir.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target_dir / filename)
        return f"{base_url.rstrip('/')}{settings.MEDIA_URL}{MEDIA_SUBDIR}/{filename}"

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        base_url = options["base_url"]
        category_name = options["category"]

        category, _ = Category.objects.get_or_create(
            slug=slugify(category_name), defaults={"name": category_name}
        )

        for spec in PRODUCTS:
            product = create_product(
                category=category,
                name=spec["name"],
                description=spec["description"],
                highlights=spec["highlights"],
                product_type=Product.ProductType.SIMPLE,
                price=spec["price"],
                cost_price=spec["cost_price"],
                sku=spec["sku"],
            )
            ProductImage.objects.create(
                product=product, url=self._store_image(spec["image"], base_url), sort_order=0
            )
            variant = product.variants.first()
            if variant is None:
                variant = create_variant(
                    product=product,
                    sku=spec["sku"],
                    price=spec["price"],
                    cost_price=spec["cost_price"],
                )
            stock_intake(
                variant=variant,
                quantity=spec["quantity"],
                unit_cost=spec["cost_price"],
                notes="Opening stock",
            )
            self.stdout.write(f"  product  {spec['name']} ({spec['quantity']} in stock)")

        bundle_variant = create_bundle(
            category=category,
            name=BUNDLE["name"],
            sku=BUNDLE["sku"],
            price=BUNDLE["price"],
            description=BUNDLE["description"],
            components=[
                {"component_variant_id": self._variant_id(sku), "quantity": 1}
                for sku in BUNDLE["components"]
            ],
        )
        ProductImage.objects.create(
            product=bundle_variant.product,
            url=self._store_image("belt-1.jpg", base_url),
            sort_order=0,
        )
        self.stdout.write(f"  combo    {BUNDLE['name']}")
        self.stdout.write(self.style.SUCCESS("\nSeeded 3 products and 1 combo."))

    def _variant_id(self, sku: str):
        from apps.catalog.models import ProductVariant

        return ProductVariant.objects.get(sku=sku).id
