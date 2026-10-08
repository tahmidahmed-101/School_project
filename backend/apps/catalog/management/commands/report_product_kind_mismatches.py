from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.catalog.models import Category, Product


class Command(BaseCommand):
    help = (
        "List products whose variants disagree with each other or with their category "
        "about being stock or pre-order. Reads only; changes nothing."
    )

    def handle(self, *args, **options) -> None:
        products = (
            Product.objects.filter(deleted_at__isnull=True)
            .select_related("category")
            .prefetch_related("variants")
            .order_by("name")
        )
        found = 0
        for product in products:
            variants = [v for v in product.variants.all() if v.deleted_at is None]
            if not variants:
                continue
            problems = self._problems(product, variants)
            if not problems:
                continue
            found += 1
            self.stdout.write(
                f"{product.name} [{product.slug}] in {product.category.name} "
                f"({product.category.category_type}): {'; '.join(problems)}"
            )
        self.stdout.write(f"{found} product(s) need a look.")

    def _problems(self, product, variants) -> list[str]:
        problems = []
        preorder = [v for v in variants if v.is_preorder_enabled]
        if preorder and len(preorder) != len(variants):
            skus = ", ".join(v.sku for v in preorder)
            problems.append(f"only some variants are pre-order ({skus})")
        is_preorder_category = product.category.category_type == Category.CategoryType.PREORDER
        if preorder and not is_preorder_category:
            problems.append("pre-order variant in a stock category")
        if is_preorder_category and not preorder:
            problems.append("no pre-order variant in a pre-order category")
        undated = [
            v.sku for v in preorder if v.preorder_start_date is None or v.preorder_end_date is None
        ]
        if undated:
            problems.append(f"pre-order without start and end date ({', '.join(undated)})")
        return problems
