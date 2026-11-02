from __future__ import annotations

from django.db import transaction

from apps.catalog.models import Brand, Category, Product, Sale
from apps.catalog.selectors.sales import clear_live_sales_cache
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.params import KIND_STOCK
from apps.common.services.soft_delete import soft_delete_instance

SALE_STOCK_ONLY_MESSAGE = "A sale covers stock products only, not pre-order ones."
TARGET_FIELDS: dict[str, str] = {
    Sale.AppliesTo.CATEGORIES: "categories",
    Sale.AppliesTo.BRANDS: "brands",
    Sale.AppliesTo.PRODUCTS: "products",
}
ID_FIELDS = {"category_ids": "categories", "brand_ids": "brands", "product_ids": "products"}


def _clear_cache() -> None:
    # Now, for readers inside this transaction, and again once it commits, so a
    # reader that refilled the cache from the old rows in between is not kept.
    clear_live_sales_cache()
    transaction.on_commit(clear_live_sales_cache)


def _stock_rows(model, ids, *, kind_field: str, code: str, message: str) -> list:
    """Live rows for `ids`, refusing unknown ids and rows of the pre-order half."""
    wanted = set(ids)
    rows = list(model.objects.filter(id__in=wanted, deleted_at__isnull=True))
    if len(rows) != len(wanted):
        raise BusinessRuleViolationError(
            "One or more of the chosen items no longer exist.", code="invalid_target"
        )
    if model.objects.filter(id__in=wanted).exclude(**{kind_field: KIND_STOCK}).exists():
        raise BusinessRuleViolationError(message, code=code)
    return rows


def stock_categories(ids, *, code: str, message: str) -> list[Category]:
    return _stock_rows(Category, ids, kind_field="category_type", code=code, message=message)


def stock_brands(ids, *, code: str, message: str) -> list[Brand]:
    return _stock_rows(Brand, ids, kind_field="kind", code=code, message=message)


def stock_products(ids, *, code: str, message: str) -> list[Product]:
    return _stock_rows(
        Product, ids, kind_field="category__category_type", code=code, message=message
    )


TARGET_LOADERS = {
    "categories": stock_categories,
    "brands": stock_brands,
    "products": stock_products,
}


def _check_window(starts_at, ends_at) -> None:
    if ends_at is not None and ends_at <= starts_at:
        raise BusinessRuleViolationError(
            "A sale must end after it starts.", code="sale_window_invalid"
        )


def _set_targets(sale: Sale, *, applies_to: str, ids_by_field: dict) -> None:
    """Keep only the targets `applies_to` names. With no new ids for them, the
    sale's current ones stand."""
    wanted = TARGET_FIELDS.get(applies_to)
    for field in TARGET_FIELDS.values():
        if field != wanted:
            getattr(sale, field).clear()
    if wanted is None:
        return
    if wanted in ids_by_field:
        rows = TARGET_LOADERS[wanted](
            ids_by_field[wanted], code="sale_stock_only", message=SALE_STOCK_ONLY_MESSAGE
        )
        getattr(sale, wanted).set(rows)
    if not getattr(sale, wanted).exists():
        raise BusinessRuleViolationError(
            f"Choose at least one of the {wanted} this sale covers.", code="sale_target_required"
        )


def _split_ids(fields: dict) -> dict:
    return {ID_FIELDS[key]: fields.pop(key) for key in list(fields) if key in ID_FIELDS}


@transaction.atomic
def create_sale(*, name: str, percent_off, starts_at, ends_at=None, **fields) -> Sale:
    ids_by_field = _split_ids(fields)
    _check_window(starts_at, ends_at)
    sale = Sale.objects.create(
        name=name, percent_off=percent_off, starts_at=starts_at, ends_at=ends_at, **fields
    )
    _set_targets(sale, applies_to=sale.applies_to, ids_by_field=ids_by_field)
    _clear_cache()
    return sale


@transaction.atomic
def update_sale(*, sale: Sale, **fields) -> Sale:
    ids_by_field = _split_ids(fields)
    for field, value in fields.items():
        setattr(sale, field, value)
    _check_window(sale.starts_at, sale.ends_at)
    if fields:
        sale.save(update_fields=[*fields.keys(), "updated_at"])
    _set_targets(sale, applies_to=sale.applies_to, ids_by_field=ids_by_field)
    _clear_cache()
    return sale


@transaction.atomic
def delete_sale(*, sale: Sale, actor=None) -> Sale:
    deleted = soft_delete_instance(sale, actor=actor)
    _clear_cache()
    return deleted
