from __future__ import annotations

from itertools import product as cartesian_product

from django.db.models import Count, Min, Prefetch
from django.db.models.functions import Lower

from apps.catalog.models import Product, ProductOption, ProductOptionValue, ProductVariant

LEGACY_AXES = (("colour", "Colour", "color"), ("size", "Size", "size"))
LEGACY_PREFIX = "legacy:"
COLOUR_NAMES = frozenset({"colour", "color"})
SIZE_NAMES = frozenset({"size"})
SUGGESTION_LIMIT = 50


def normalise_label(text) -> str:
    return " ".join(str(text or "").split())


def label_key(text) -> str:
    return normalise_label(text).casefold()


def option_values_prefetch() -> Prefetch:
    return Prefetch("option_values", queryset=ProductOptionValue.objects.select_related("option"))


def _live_variants(product: Product) -> list[ProductVariant]:
    cached = getattr(product, "active_variants", None)
    if cached is not None:
        return cached
    return list(
        product.variants.filter(deleted_at__isnull=True).prefetch_related(option_values_prefetch())
    )


def _legacy_value_id(axis: str, text: str) -> str:
    return f"{LEGACY_PREFIX}{axis}:{label_key(text).replace(' ', '-')}"


def _legacy_pairs(variant: ProductVariant) -> list[dict]:
    return [
        {
            "option_id": f"{LEGACY_PREFIX}{axis}",
            "option_name": name,
            "value_id": _legacy_value_id(axis, getattr(variant, column)),
            "value": normalise_label(getattr(variant, column)),
        }
        for axis, name, column in LEGACY_AXES
        if normalise_label(getattr(variant, column))
    ]


def _legacy_options(variants: list[ProductVariant]) -> list[dict]:
    options: dict[str, dict] = {}
    for variant in variants:
        for pair in _legacy_pairs(variant):
            option = options.setdefault(
                pair["option_id"],
                {"id": pair["option_id"], "name": pair["option_name"], "values": {}},
            )
            option["values"].setdefault(pair["value_id"], pair["value"])
    return [
        {
            "id": option["id"],
            "name": option["name"],
            "position": position,
            "values": [
                {"id": value_id, "value": value, "position": value_position}
                for value_position, (value_id, value) in enumerate(option["values"].items())
            ],
        }
        for position, option in enumerate(
            options[f"{LEGACY_PREFIX}{axis}"]
            for axis, _name, _column in LEGACY_AXES
            if f"{LEGACY_PREFIX}{axis}" in options
        )
    ]


def variant_option_values(variant: ProductVariant) -> list[dict]:
    """The variant's value per option, in option order."""
    if not variant.title:
        # Legacy colour/size text; dead once `move_colour_size_to_options` has run.
        return _legacy_pairs(variant)
    values = sorted(variant.option_values.all(), key=lambda value: value.option.position)
    return [
        {
            "option_id": value.option_id,
            "option_name": value.option.name,
            "value_id": value.id,
            "value": value.value,
        }
        for value in values
    ]


def variant_title(variant: ProductVariant) -> str:
    return variant.title or " / ".join(pair["value"] for pair in _legacy_pairs(variant))


def line_variant_title(line) -> str:
    """What an order line prints: its snapshot, else the variant as it is now."""
    return line.variant_title or variant_title(line.variant)


def variant_legacy_field(variant: ProductVariant, names: frozenset[str]) -> str:
    """Value of the option called Colour or Size, for the old `color` / `size` fields."""
    for pair in variant_option_values(variant):
        if pair["option_name"].casefold() in names:
            return pair["value"]
    return ""


def product_options(product: Product, *, sellable_only: bool = False) -> list[dict]:
    """Every reader's view of a product's options. `sellable_only` keeps the
    values a live, active variant uses (the storefront's pick-list)."""
    variants = _live_variants(product)
    if sellable_only:
        variants = [variant for variant in variants if variant.is_active]
    stored = list(product.options.all())
    if stored:
        options = [
            {
                "id": option.id,
                "name": option.name,
                "position": option.position,
                "values": [
                    {"id": value.id, "value": value.value, "position": value.position}
                    for value in option.values.all()
                ],
            }
            for option in stored
        ]
    else:
        options = _legacy_options(variants)
    if not sellable_only:
        return options
    used = {pair["value_id"] for variant in variants for pair in variant_option_values(variant)}
    for option in options:
        option["values"] = [value for value in option["values"] if value["id"] in used]
    return [option for option in options if option["values"]]


def product_combinations(product: Product) -> list[dict]:
    """Every possible combination in option order, with the live variant that holds it."""
    options = product_options(product)
    if not options:
        return []
    by_combination = {
        frozenset(pair["value_id"] for pair in variant_option_values(variant)): variant
        for variant in _live_variants(product)
    }
    combinations = []
    for values in cartesian_product(*(option["values"] for option in options)):
        variant = by_combination.get(frozenset(value["id"] for value in values))
        combinations.append(
            {
                "value_ids": [value["id"] for value in values],
                "title": " / ".join(value["value"] for value in values),
                "variant_id": variant.id if variant else None,
            }
        )
    return combinations


def missing_combination_count(product: Product) -> int:
    return sum(1 for row in product_combinations(product) if row["variant_id"] is None)


def product_specs(product: Product) -> list[dict]:
    specs = product.specs
    if isinstance(specs, dict):
        return [{"name": str(name), "value": str(value)} for name, value in specs.items()]
    return [{"name": row["name"], "value": row["value"]} for row in specs or []]


def option_suggestions(*, name: str = "") -> dict:
    """Names and values already used in the shop, most used first."""

    def ranked(queryset, field: str) -> list[str]:
        rows = (
            queryset.values(key=Lower(field))
            .annotate(uses=Count("id"), label=Min(field))
            .order_by("-uses", "key")[:SUGGESTION_LIMIT]
        )
        return [row["label"] for row in rows]

    live = ProductOption.objects.filter(product__deleted_at__isnull=True)
    values: list[str] = []
    name = normalise_label(name)
    if name:
        values = ranked(
            ProductOptionValue.objects.filter(
                option__name__iexact=name, option__product__deleted_at__isnull=True
            ),
            "value",
        )
    return {"names": ranked(live, "name"), "values": values}
