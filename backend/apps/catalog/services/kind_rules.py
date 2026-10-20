from __future__ import annotations

from apps.catalog.models import Category
from apps.common.exceptions import BusinessRuleViolationError

PREORDER_ONLY_FIELDS = (
    "is_preorder_enabled",
    "preorder_price",
    "preorder_start_date",
    "preorder_end_date",
    "release_date",
    "preorder_stock_limit",
    "preorder_min_quantity",
)
# A pre-order field whose unset value is not None/False. It holds this on
# every row, so on a stock row it counts as set only when it differs.
PREORDER_FIELD_DEFAULTS = {"preorder_min_quantity": 1}
STOCK_ONLY_FIELDS = ("discount_price", "wholesale_price")
STOCK_ONLY_STOCK_ITEM_FIELDS = ("reorder_point", "target_stock_level")


def is_preorder_category(category: Category) -> bool:
    return category.category_type == Category.CategoryType.PREORDER


def _is_set(name: str, value) -> bool:
    if name in PREORDER_FIELD_DEFAULTS:
        return value is not None and value != PREORDER_FIELD_DEFAULTS[name]
    return value is not None and value is not False


def fields_of_other_kind(category: Category, values: dict) -> list[str]:
    """The names in `values` that belong to the other kind and carry a value."""
    names = STOCK_ONLY_FIELDS if is_preorder_category(category) else PREORDER_ONLY_FIELDS
    return [name for name in names if _is_set(name, values.get(name))]


def check_variant_kind(*, category: Category, values: dict) -> None:
    offending = fields_of_other_kind(category, values)
    if not offending:
        return
    listed = ", ".join(offending)
    if is_preorder_category(category):
        raise BusinessRuleViolationError(
            f"A pre-order product cannot carry stock-only fields: {listed}.",
            code="stock_field_on_preorder",
        )
    raise BusinessRuleViolationError(
        f"A stock product cannot carry pre-order fields: {listed}.",
        code="preorder_category_required",
    )


def check_stock_levels_kind(*, category: Category, values: dict) -> None:
    offending = [name for name in STOCK_ONLY_STOCK_ITEM_FIELDS if values.get(name)]
    if offending and is_preorder_category(category):
        raise BusinessRuleViolationError(
            "A pre-order product has no reorder point or target stock level.",
            code="stock_field_on_preorder",
        )
