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
from apps.catalog.models import Category, Product, ProductVariant
from apps.catalog.services.kind_rules import PREORDER_ONLY_FIELDS, is_preorder_category
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


PREORDER_EXPORT_COLUMNS = [
    "product_name",
    "sku",
    "price",
    "cost_price",
    "preorder_price",
    "preorder_start_date",
    "preorder_end_date",
    "release_date",
    "preorder_stock_limit",
    "weight",
    "color",
    "size",
    "is_active",
]


def _text(value) -> str:
    return "" if value is None else str(value)


def _date(value) -> str:
    return value.isoformat() if value is not None else ""


def _stock_rows(variants: list[ProductVariant]) -> list[list]:
    stock_by_variant = available_quantities_for_variants(v.id for v in variants)
    return [
        [
            variant.product.name,
            variant.sku,
            variant.barcode,
            str(variant.price),
            str(variant.cost_price),
            _text(variant.discount_price),
            stock_by_variant.get(variant.id, 0),
            _text(variant.weight),
            variant.color,
            variant.size,
            "1" if variant.is_active else "0",
        ]
        for variant in variants
    ]


def _preorder_rows(variants: list[ProductVariant]) -> list[list]:
    return [
        [
            variant.product.name,
            variant.sku,
            str(variant.price),
            str(variant.cost_price),
            _text(variant.preorder_price),
            _date(variant.preorder_start_date),
            _date(variant.preorder_end_date),
            _date(variant.release_date),
            _text(variant.preorder_stock_limit),
            _text(variant.weight),
            variant.color,
            variant.size,
            "1" if variant.is_active else "0",
        ]
        for variant in variants
    ]


def export_variants(
    queryset: QuerySet[ProductVariant],
    *,
    fmt: Literal["csv", "xlsx"],
    kind: str | None = None,
) -> bytes:
    """One kind per file, each with its own columns. No `kind` means stock."""
    kind = kind or Category.CategoryType.STOCK
    variants = list(
        queryset.filter(product__category__category_type=kind).select_related("product")
    )
    if kind == Category.CategoryType.PREORDER:
        columns, rows = PREORDER_EXPORT_COLUMNS, _preorder_rows(variants)
    else:
        columns, rows = EXPORT_COLUMNS, _stock_rows(variants)

    if fmt == "csv":
        return build_csv(columns, rows)

    from openpyxl import Workbook

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Variants"
    sheet.append(columns)
    for row in rows:
        sheet.append([sanitize_cell(cell) for cell in row])
    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()


BLANK_CELLS = {"", "0", "false", "no"}


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


def _refuse_preorder_row(row: dict, product: Product, variant: ProductVariant | None) -> None:
    """The import is a stock tool: it neither touches a pre-order product nor
    sets pre-order fields."""
    if is_preorder_category(product.category):
        raise ValueError(f"Product '{product.name}' is a pre-order product; import is stock only")
    if variant is not None and is_preorder_category(variant.product.category):
        raise ValueError(f"SKU '{variant.sku}' is a pre-order SKU; import is stock only")
    given = [
        name
        for name in PREORDER_ONLY_FIELDS
        if str(row.get(name) or "").strip().lower() not in BLANK_CELLS
    ]
    if given:
        raise ValueError(f"Pre-order fields cannot be imported: {', '.join(given)}")


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
        for variant in ProductVariant.objects.select_related("product__category").filter(
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
                    products_by_name[product_name] = (
                        Product.objects.select_related("category")
                        .filter(name__iexact=product_name, deleted_at__isnull=True)
                        .first()
                    )
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
                _refuse_preorder_row(row, product, variant)
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
