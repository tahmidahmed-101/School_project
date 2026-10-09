from __future__ import annotations

from collections import Counter
from typing import Any

from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction
from django.db.models import Q

from apps.catalog.models import Product, ProductOption, ProductOptionValue, ProductVariant
from apps.catalog.selectors.options import LEGACY_AXES, label_key, normalise_label
from apps.catalog.services.options import sync_product_type
from apps.orders.models import SalesOrderLine

HAS_LEGACY_TEXT = ~Q(color="") | ~Q(size="")


def _texts(variant: ProductVariant) -> dict[str, str]:
    """Normalised legacy text of a variant per axis column, blanks left out."""
    columns = [column for _axis, _name, column in LEGACY_AXES]
    texts = {column: normalise_label(getattr(variant, column)) for column in columns}
    return {column: text for column, text in texts.items() if text}


def _refusal(product: Product, live: list[ProductVariant]) -> str:
    if product.product_type == Product.ProductType.BUNDLE:
        return "a bundle takes no options"
    axes = {column for variant in live for column in _texts(variant)}
    if any(set(_texts(variant)) != axes for variant in live):
        return "one variant has a colour or size that another lacks"
    combinations = Counter(
        tuple(label_key(_texts(variant)[column]) for column in sorted(axes)) for variant in live
    )
    if any(count > 1 for count in combinations.values()):
        return "two live variants would be the same combination"
    return ""


class Command(BaseCommand):
    help = (
        "Move the old colour/size text of variants into product options. "
        "Dry run unless --apply is given."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--apply", action="store_true", default=False)

    def handle(self, *args: Any, **options: Any) -> None:
        apply = options["apply"]
        self.counts: Counter = Counter()
        skipped: list[tuple[Product, str, list[str]]] = []

        with transaction.atomic():
            products = (
                Product.objects.filter(options__isnull=True)
                .filter(variants__in=ProductVariant.objects.filter(HAS_LEGACY_TEXT))
                .distinct()
                .order_by("name", "id")
            )
            for product in products:
                variants = list(product.variants.order_by("created_at", "id"))
                live = [variant for variant in variants if variant.deleted_at is None]
                if not any(_texts(variant) for variant in live):
                    continue
                reason = _refusal(product, live)
                if reason:
                    skipped.append((product, reason, [variant.sku for variant in live]))
                    continue
                self._move(product, variants, live)
            if not apply:
                transaction.set_rollback(True)

        verb = "Moved" if apply else "Would move"
        self.stdout.write(
            f"{verb} {self.counts['products']} products: {self.counts['options']} options, "
            f"{self.counts['values']} values, {self.counts['variants']} variants linked, "
            f"{self.counts['order_lines']} order lines titled."
        )
        self.stdout.write(f"Left alone for a person to fix: {len(skipped)} products.")
        for product, reason, skus in skipped:
            self.stdout.write(f"  {product.name} ({product.id}): {reason}. SKUs: {', '.join(skus)}")
        if not apply:
            self.stdout.write("Dry run: nothing was written. Run again with --apply to write.")

    def _move(self, product: Product, variants: list, live: list) -> None:
        values: dict[tuple[str, str], ProductOptionValue] = {}
        position = 0
        for _axis, name, column in LEGACY_AXES:
            texts = [_texts(variant)[column] for variant in live if column in _texts(variant)]
            if not texts:
                continue
            option = ProductOption.objects.create(product=product, name=name, position=position)
            position += 1
            self.counts["options"] += 1
            unique = {label_key(text): text for text in reversed(texts)}
            for value_position, key in enumerate(dict.fromkeys(label_key(text) for text in texts)):
                values[column, key] = ProductOptionValue.objects.create(
                    option=option, value=unique[key], position=value_position
                )
                self.counts["values"] += 1
        axes = {column for column, _key in values}

        titled = []
        for variant in variants:
            texts = _texts(variant)
            picked = [values.get((column, label_key(text))) for column, text in texts.items()]
            # A deleted variant with a value no live variant has stays on its old text.
            if set(texts) != axes or None in picked:
                self._title_lines(variant, " / ".join(texts.values()))
                continue
            variant.option_values.set(picked)
            variant.title = " / ".join(value.value for value in picked)
            titled.append(variant)
            self._title_lines(variant, variant.title)
        ProductVariant.objects.bulk_update(titled, ["title"])
        self.counts["variants"] += len(titled)
        self.counts["products"] += 1
        sync_product_type(product)

    def _title_lines(self, variant: ProductVariant, title: str) -> None:
        if title:
            self.counts["order_lines"] += SalesOrderLine.objects.filter(
                variant=variant, variant_title=""
            ).update(variant_title=title)
