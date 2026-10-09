from __future__ import annotations

import contextlib
from decimal import Decimal
from typing import Any

from django.core.management.base import BaseCommand, CommandParser
from django.utils.text import slugify

from apps.catalog.models import (
    Category,
    Product,
    ProductImage,
    ProductOption,
    ProductOptionValue,
    ProductVariant,
)
from apps.catalog.services.options import build_title
from apps.common.utils.money import quantize
from apps.inventory.models import StockItem

PRODUCTS: list[dict[str, Any]] = [
    # Money Bag (Wallet) - 4 Products x 3 Images
    {
        "name": "HERITAGE BIFOLD WALLET",
        "category": "wallet",
        "price": "95.00",
        "images": [
            "/images/wallet/wallet-1.jpg",
            "/images/wallet/wallet-2.jpg",
            "/images/wallet/wallet-3.jpg",
        ],
    },
    {
        "name": "SLIM CARD HOLDER WALLET",
        "category": "wallet",
        "price": "75.00",
        "images": [
            "/images/wallet/wallet-2.jpg",
            "/images/wallet/wallet-3.jpg",
            "/images/wallet/wallet-4.jpg",
        ],
    },
    {
        "name": "VINTAGE PASSPORT WALLET",
        "category": "wallet",
        "price": "115.00",
        "images": [
            "/images/wallet/wallet-3.jpg",
            "/images/wallet/wallet-4.jpg",
            "/images/wallet/wallet-1.jpg",
        ],
    },
    {
        "name": "MINIMALIST MONEY CLIP WALLET",
        "category": "wallet",
        "price": "85.00",
        "images": [
            "/images/wallet/wallet-4.jpg",
            "/images/wallet/wallet-1.jpg",
            "/images/wallet/wallet-2.jpg",
        ],
    },
    # Sunglasses - 4 Products x 3 Images
    {
        "name": "AVIATOR GOLD SUNGLASSES",
        "category": "sunglasses",
        "price": "120.00",
        "images": [
            "/images/sunglasses/sunglasses-1.jpg",
            "/images/sunglasses/sunglasses-2.jpg",
            "/images/sunglasses/sunglasses-3.jpg",
        ],
    },
    {
        "name": "CLASSIC WAYFARER SUNGLASSES",
        "category": "sunglasses",
        "price": "110.00",
        "images": [
            "/images/sunglasses/sunglasses-2.jpg",
            "/images/sunglasses/sunglasses-3.jpg",
            "/images/sunglasses/sunglasses-4.jpg",
        ],
    },
    {
        "name": "POLARIZED CLUBMASTER SUNGLASSES",
        "category": "sunglasses",
        "price": "135.00",
        "images": [
            "/images/sunglasses/sunglasses-3.jpg",
            "/images/sunglasses/sunglasses-4.jpg",
            "/images/sunglasses/sunglasses-1.jpg",
        ],
    },
    {
        "name": "SQUARE ACETATE SUNGLASSES",
        "category": "sunglasses",
        "price": "140.00",
        "images": [
            "/images/sunglasses/sunglasses-4.jpg",
            "/images/sunglasses/sunglasses-1.jpg",
            "/images/sunglasses/sunglasses-2.jpg",
        ],
    },
    # Belt - 4 Products x 3 Images
    {
        "name": "GRANVILLE LEATHER BELT",
        "category": "belt",
        "price": "145.00",
        "images": [
            "/images/belt/belt-1.jpg",
            "/images/belt/belt-2.jpg",
            "/images/belt/belt-3.jpg",
        ],
    },
    {
        "name": "REVERSIBLE TRAVEL BELT",
        "category": "belt",
        "price": "110.00",
        "images": [
            "/images/belt/belt-2.jpg",
            "/images/belt/belt-3.jpg",
            "/images/belt/belt-4.jpeg",
        ],
    },
    {
        "name": "OXFORD DOUBLE-STITCH BELT",
        "category": "belt",
        "price": "160.00",
        "images": [
            "/images/belt/belt-3.jpg",
            "/images/belt/belt-4.jpeg",
            "/images/belt/belt-1.jpg",
        ],
    },
    {
        "name": "COLOGNE CALF CLASSIC BELT",
        "category": "belt",
        "price": "130.00",
        "images": [
            "/images/belt/belt-4.jpeg",
            "/images/belt/belt-1.jpg",
            "/images/belt/belt-2.jpg",
        ],
    },
    # Perfume - 4 Products x 3 Images
    {
        "name": "SANTAL OUD NOIR",
        "category": "perfume",
        "price": "245.00",
        "images": [
            "/images/perfume/perfume-1.jpg",
            "/images/perfume/perfume-2.jpg",
            "/images/perfume/perfume-3.webp",
        ],
    },
    {
        "name": "VETIVER & VANILLE EAU DE PARFUM",
        "category": "perfume",
        "price": "225.00",
        "images": [
            "/images/perfume/perfume-2.jpg",
            "/images/perfume/perfume-3.webp",
            "/images/perfume/perfume-4.avif",
        ],
    },
    {
        "name": "AMBER VETIVER EAU DE PARFUM",
        "category": "perfume",
        "price": "215.00",
        "images": [
            "/images/perfume/perfume-3.webp",
            "/images/perfume/perfume-4.avif",
            "/images/perfume/perfume-1.jpg",
        ],
    },
    {
        "name": "CEDAR & IRIS EXTRAIT DE PARFUM",
        "category": "perfume",
        "price": "235.00",
        "images": [
            "/images/perfume/perfume-4.avif",
            "/images/perfume/perfume-1.jpg",
            "/images/perfume/perfume-2.jpg",
        ],
    },
]

CATEGORIES = [
    ("Money Bag", "wallet"),
    ("Sunglasses", "sunglasses"),
    ("Belt", "belt"),
    ("Perfume", "perfume"),
]

VARIANT_AXES: dict[str, list[dict[str, str]]] = {
    "wallet": [{"color": "Black"}, {"color": "Brown"}, {"color": "Tan"}],
    "sunglasses": [{"color": "Black"}, {"color": "Brown"}, {"color": "Navy"}],
    "belt": [
        {"color": "Black", "size": "34"},
        {"color": "Black", "size": "36"},
        {"color": "Brown", "size": "34"},
        {"color": "Brown", "size": "36"},
    ],
    "perfume": [{"size": "50ml"}, {"size": "100ml", "price_factor": "1.6"}],
}

OPTION_NAMES = {"color": "Colour", "size": "Size"}

BRAND = "LaunchCart"


class Command(BaseCommand):
    help = "Seed the catalog with 4 categories, 4 products per category, and 3 images per product."

    def _create_options(self, product: Product, specs: list[dict[str, str]]) -> dict:
        """Option values of one product, keyed by (axis key, text)."""
        product.options.all().delete()
        values = {}
        axes = [key for key in OPTION_NAMES if any(key in spec for spec in specs)]
        for position, key in enumerate(axes):
            option = ProductOption.objects.create(
                product=product, name=OPTION_NAMES[key], position=position
            )
            texts = list(dict.fromkeys(spec[key] for spec in specs))
            for value_position, text in enumerate(texts):
                values[key, text] = ProductOptionValue.objects.create(
                    option=option, value=text, position=value_position
                )
        return values

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--image-base-url", default="")
        parser.add_argument("--stock-quantity", type=int, default=50)
        # Opt-in, not default: this wipes every order, shipment, purchase order
        # and journal-adjacent row in the database, not just catalog rows.
        parser.add_argument("--flush-orders", action="store_true", default=False)

    def handle(self, *args: Any, **options: Any) -> None:
        image_base = options["image_base_url"].rstrip("/")

        # argparse stores this as `flush_orders`; the old "flush-orders" lookup
        # always read None, so the sweep below silently never ran.
        if options.get("flush_orders"):
            import django.apps

            # 1. Explicit sweep of child tables with PROTECT foreign keys
            explicit_models = [
                "orders.ShipmentLine",
                "orders.Shipment",
                "orders.ReturnRMALine",
                "orders.ReturnRMA",
                "orders.Payment",
                "orders.SalesOrderLine",
                "orders.SalesOrder",
                "procurement.GRNLine",
                "procurement.GoodsReceiptNote",
                "accounting.VendorBillLine",
                "accounting.VendorBill",
                "procurement.PurchaseOrderLine",
                "procurement.PurchaseOrder",
                "orders.StockReservation",
                "inventory.StockLedgerEntry",
                "inventory.StockItem",
                "catalog.BundleItem",
                "catalog.ProductImage",
                "catalog.ProductVariant",
                "discounts.Discount",
                "coupons.Coupon",
                "catalog.Product",
                "catalog.Category",
            ]
            for model_label in explicit_models:
                with contextlib.suppress(Exception):
                    m = django.apps.apps.get_model(model_label)
                    m.objects.all().delete()

            # 2. Dynamic multi-pass sweep for any remaining custom models
            models_to_clear = [
                m
                for m in django.apps.apps.get_models()
                if not m._meta.app_label.startswith("auth")
                and not m._meta.app_label.startswith("contenttypes")
                and not m._meta.app_label.startswith("sessions")
                and not m._meta.app_label.startswith("admin")
            ]
            for _ in range(5):
                for m in models_to_clear:
                    with contextlib.suppress(Exception):
                        m.objects.all().delete()
            self.stdout.write("Cleaned up all existing orders, inventory, and catalog data.")

        # Clear old catalog completely to ensure clean schema
        ProductImage.objects.all().delete()
        ProductVariant.objects.all().delete()
        Product.objects.all().delete()
        Category.objects.all().delete()

        categories = {}
        for name, slug in CATEGORIES:
            category, _ = Category.objects.get_or_create(slug=slug, defaults={"name": name})
            categories[slug] = category

        variant_total = 0
        for item in PRODUCTS:
            slug = slugify(item["name"])
            specs = VARIANT_AXES[item["category"]]
            product, _ = Product.objects.update_or_create(
                slug=slug,
                defaults={
                    "category": categories[item["category"]],
                    "name": item["name"].title(),
                    "description": f"{item['name'].title()} — a signature {BRAND} piece.",
                    "product_type": Product.ProductType.VARIANT,
                },
            )
            values = self._create_options(product, specs)

            for spec in specs:
                picked = [values[key, spec[key]] for key in OPTION_NAMES if key in spec]
                combo = slugify(" ".join(value.value for value in picked)).upper()
                price = Decimal(item["price"]) * Decimal(spec.get("price_factor", "1"))
                variant, _ = ProductVariant.objects.update_or_create(
                    product=product,
                    sku=f"SKU-{slug.upper()}-{combo}",
                    defaults={"price": quantize(price), "title": build_title(picked)},
                )
                variant.option_values.set(picked)
                StockItem.objects.update_or_create(
                    variant=variant,
                    defaults={
                        "quantity_on_hand": options["stock_quantity"],
                        "quantity_reserved": 0,
                    },
                )
            variant_total += len(specs)

            # Re-add 3 images per product
            for idx, img_path in enumerate(item.get("images", [])):
                ProductImage.objects.create(
                    product=product,
                    url=f"{image_base}{img_path}",
                    sort_order=idx,
                )

            self.stdout.write(
                f"  {slug} -> {len(specs)} variants, 3 images, "
                f"stock {options['stock_quantity']} each"
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {len(PRODUCTS)} products ({variant_total} variants) across "
                f"{len(CATEGORIES)} categories with 3 images each."
            )
        )
