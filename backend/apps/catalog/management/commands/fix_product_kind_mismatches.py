from __future__ import annotations

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q

from apps.catalog.models import ProductVariant
from apps.catalog.services.kind_rules import (
    PREORDER_ONLY_FIELDS,
    STOCK_ONLY_FIELDS,
    STOCK_ONLY_STOCK_ITEM_FIELDS,
    fields_of_other_kind,
)
from apps.inventory.models import StockItem


def _cleared(field: str):
    return False if field == "is_preorder_enabled" else None


class Command(BaseCommand):
    help = (
        "Clear pre-order fields from variants in stock categories, and stock-only fields "
        "(discount and wholesale price, reorder point, target level) from variants in "
        "pre-order categories. Prints what it would change; pass --apply to write."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument("--apply", action="store_true", help="Write the changes.")

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        apply = options["apply"]
        verb = "cleared" if apply else "would clear"
        changed = 0
        variants = (
            ProductVariant.objects.filter(deleted_at__isnull=True)
            .select_related("product__category")
            .order_by("sku")
        )
        for variant in variants:
            category = variant.product.category
            values = {
                field: getattr(variant, field)
                for field in (*PREORDER_ONLY_FIELDS, *STOCK_ONLY_FIELDS)
            }
            fields = fields_of_other_kind(category, values)
            stock_rows = self._stock_rows_with_levels(variant)
            if not fields and not stock_rows:
                continue
            changed += 1
            parts = [f"{field}={values[field]}" for field in fields]
            if stock_rows:
                parts.append(f"reorder point / target level on {len(stock_rows)} stock row(s)")
            self.stdout.write(
                f"{variant.sku} ({variant.product.name}) in {category.name} "
                f"({category.category_type}): {verb} {', '.join(parts)}"
            )
            if not apply:
                continue
            if fields:
                ProductVariant.objects.filter(pk=variant.pk).update(
                    **{field: _cleared(field) for field in fields}
                )
            if stock_rows:
                StockItem.objects.filter(pk__in=stock_rows).update(
                    **dict.fromkeys(STOCK_ONLY_STOCK_ITEM_FIELDS, 0)
                )
        if apply:
            self.stdout.write(f"{changed} variant(s) fixed.")
            call_command("report_product_kind_mismatches", stdout=self.stdout)
        else:
            self.stdout.write(f"{changed} variant(s) would change. Dry run; nothing written.")

    def _stock_rows_with_levels(self, variant) -> list:
        category = variant.product.category
        if category.category_type != category.CategoryType.PREORDER:
            return []
        return list(
            StockItem.objects.filter(variant=variant)
            .filter(Q(reorder_point__gt=0) | Q(target_stock_level__gt=0))
            .values_list("pk", flat=True)
        )
