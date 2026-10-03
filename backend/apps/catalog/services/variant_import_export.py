from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Literal

from django.db import transaction
from django.db.models import QuerySet

from apps.business.constants import ModuleKey
from apps.business.selectors.modules import is_feature_enabled
from apps.catalog.models import Product, ProductVariant
from apps.common.utils.export import build_csv, sanitize_cell
from apps.inventory.selectors.stock import available_quantities_for_variants

EXPORT_COLUMNS = [
    "product_name",
    "sku",
    "barcode",
    "price",
    "cost_price",
    "discount_price",
    "stock",
    "weight",
    "color",
    "size",
    "is_active",
]


def export_variants(queryset: QuerySet[ProductVariant], *, fmt: Literal["csv", "xlsx"]) -> bytes:
    variants = list(queryset.select_related("product"))
    stock_by_variant = available_quantities_for_variants(v.id for v in variants)

    rows = [
        [
            variant.product.name,
            variant.sku,
            variant.barcode,
            str(variant.price),
            str(variant.cost_price),
            str(variant.discount_price) if variant.discount_price is not None else "",
            stock_by_variant.get(variant.id, 0),
            str(variant.weight) if variant.weight is not None else "",
            variant.color,
            variant.size,
            "1" if variant.is_active else "0",
        ]
        for variant in variants
    ]

    if fmt == "csv":
        return build_csv(EXPORT_COLUMNS, rows)

    from openpyxl import Workbook

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Variants"
    sheet.append(EXPORT_COLUMNS)
    for row in rows:
        sheet.append([sanitize_cell(cell) for cell in row])
    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()


@dataclass
class ImportResult:
    created: int = 0
    updated: int = 0
    errors: list[dict] = field(default_factory=list)


def _read_rows(file, *, fmt: Literal["csv", "xlsx"]) -> list[dict]:
    if fmt == "csv":
        text = file.read().decode("utf-8")
        return list(csv.DictReader(io.StringIO(text)))

    from openpyxl import load_workbook

    workbook = load_workbook(file, read_only=True, data_only=True)
    sheet = workbook.active
    rows_iter = sheet.iter_rows(values_only=True)
    header = [str(cell).strip() if cell is not None else "" for cell in next(rows_iter)]
    return [
        dict(zip(header, [("" if cell is None else str(cell)) for cell in row], strict=False))
        for row in rows_iter
    ]


def import_variants(*, file, fmt: Literal["csv", "xlsx"]) -> ImportResult:
    """Each row is processed in its own savepoint so a single bad row is
    reported and skipped instead of aborting the whole file."""
    result = ImportResult()
    variations_on = is_feature_enabled(ModuleKey.CATALOG, "product_variations")
    rows = _read_rows(file, fmt=fmt)
    # One query for every SKU in the file, and one per distinct product name,
    # rather than both per row — a file is often many SKUs of a few products.
    variants_by_sku = {
        variant.sku: variant
        for variant in ProductVariant.objects.filter(
            sku__in={(row.get("sku") or "").strip() for row in rows}
        )
    }
    products_by_name: dict[str, Product | None] = {}

    for row_number, row in enumerate(rows, start=2):
        sku = (row.get("sku") or "").strip()
        product_name = (row.get("product_name") or "").strip()
        try:
            with transaction.atomic():
                if not sku:
                    raise ValueError("sku is required")
                if not product_name:
                    raise ValueError("product_name is required")

                if product_name not in products_by_name:
                    products_by_name[product_name] = Product.objects.filter(
                        name__iexact=product_name, deleted_at__isnull=True
                    ).first()
                product = products_by_name[product_name]
                if product is None:
                    raise ValueError(f"Product '{product_name}' not found")

                try:
                    price = Decimal(str(row.get("price") or "0"))
                    cost_price = Decimal(str(row.get("cost_price") or "0"))
                    discount_raw = (row.get("discount_price") or "").strip()
                    discount_price = Decimal(discount_raw) if discount_raw else None
                    weight_raw = (row.get("weight") or "").strip()
                    weight = Decimal(weight_raw) if weight_raw else None
                except InvalidOperation as exc:
                    raise ValueError(f"Invalid numeric value: {exc}") from exc

                color = (row.get("color") or "").strip()
                size = (row.get("size") or "").strip()
                is_active_raw = str(row.get("is_active") or "1").strip().lower()
                is_active = is_active_raw in {"1", "true", "yes"}

                variant = variants_by_sku.get(sku)
                if variant is None:
                    # The importer writes rows directly, so the single-variant
                    # rule has to be repeated here rather than inherited.
                    if (
                        not variations_on
                        and product.variants.filter(deleted_at__isnull=True).exists()
                    ):
                        raise ValueError(
                            f"Product '{product_name}' already has a SKU and product "
                            "variations are switched off"
                        )
                    variant = ProductVariant.objects.create(
                        product=product,
                        sku=sku,
                        barcode=row.get("barcode") or "",
                        price=price,
                        cost_price=cost_price,
                        discount_price=discount_price,
                        weight=weight,
                        color=color,
                        size=size,
                        is_active=is_active,
                    )
                    result.created += 1
                else:
                    variant.product = product
                    variant.barcode = row.get("barcode") or ""
                    variant.price = price
                    variant.cost_price = cost_price
                    variant.discount_price = discount_price
                    variant.weight = weight
                    variant.color = color
                    variant.size = size
                    variant.is_active = is_active
                    variant.save(
                        update_fields=[
                            "product",
                            "barcode",
                            "price",
                            "cost_price",
                            "discount_price",
                            "weight",
                            "color",
                            "size",
                            "is_active",
                        ]
                    )
                    result.updated += 1
            # Only once the row's savepoint has committed, so a later row with
            # the same SKU updates this variant rather than creating another.
            variants_by_sku[sku] = variant
        except ValueError as exc:
            result.errors.append({"row": row_number, "sku": sku, "message": str(exc)})

    return result
