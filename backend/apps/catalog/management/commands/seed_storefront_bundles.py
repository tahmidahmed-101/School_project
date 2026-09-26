from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.catalog.models import Category, Product
from apps.catalog.services.bundles import create_bundle

# Mirrors valor-men's combo showcase — same bundles seeded on every environment
# so the storefront's combo section never ends up empty.
BUNDLES: list[dict[str, Any]] = [
    {
        "name": "The Executive Signature Set",
        "description": (
            "One coherent signature from the fragrance to the waistline to the wallet."
        ),
        "highlights": [
            "Three signature pieces arrive together in a velvet-lined presentation box with a "
            "certificate of authenticity."
        ],
        "price": "399.00",
        "components": ["santal-oud-noir", "granville-leather-belt", "heritage-bifold-wallet"],
    },
    {
        "name": "The After Dark Edit",
        "description": (
            "A statement for evening engagements. The After Dark Edit pairs Vetiver & Vanille with "
            "the hand-stitched Oxford Double-Stitch belt and Aviator Gold sunglasses."
        ),
        "highlights": [
            "Three evening-ready pieces arrive together in a velvet-lined presentation box with a "
            "certificate of authenticity, made for the nights that matter."
        ],
        "price": "349.00",
        "components": [
            "vetiver-vanille-eau-de-parfum",
            "oxford-double-stitch-belt",
            "aviator-gold-sunglasses",
        ],
    },
]

BRAND = "LaunchCart"


class Command(BaseCommand):
    help = (
        "Seed the storefront's combo bundles — requires seed_storefront_catalog to have run first."
    )

    @transaction.atomic
    def handle(self, *args: Any, **options: Any) -> None:
        category = Category.objects.filter(slug="perfume").first() or Category.objects.first()
        if category is None:
            self.stderr.write("No categories found — run seed_storefront_catalog first.")
            return

        for item in BUNDLES:
            existing = Product.objects.filter(
                name=item["name"], product_type=Product.ProductType.BUNDLE
            ).first()
            if existing is not None:
                self.stdout.write(f"  {existing.slug} -> already exists, skipping")
                continue

            components = []
            for slug in item["components"]:
                product = Product.objects.filter(slug=slug).first()
                if product is None:
                    self.stderr.write(f"  component product '{slug}' not found, skipping bundle")
                    break
                variant = product.variants.first()
                if variant is None:
                    self.stderr.write(
                        f"  component product '{slug}' has no variant, skipping bundle"
                    )
                    break
                components.append({"component_variant_id": variant.id, "quantity": 1})
            else:
                variant = create_bundle(
                    category=category,
                    name=item["name"],
                    sku=f"BUNDLE-{item['name'].upper().replace(' ', '-').replace(chr(39), '')}",
                    components=components,
                    price=Decimal(item["price"]),
                    description=item["description"],
                )
                variant.product.highlights = item["highlights"]
                variant.product.save(update_fields=["highlights"])
                self.stdout.write(f"  {variant.product.slug} -> variant {variant.id}")
                continue
            self.stdout.write(f"  {item['name']} -> skipped, missing component")

        self.stdout.write(self.style.SUCCESS(f"Seeded {len(BUNDLES)} bundles."))
