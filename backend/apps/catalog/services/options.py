from __future__ import annotations

from collections import Counter

from django.db import transaction

from apps.audit.services.audit import log_action
from apps.business.constants import ModuleKey
from apps.business.services.modules import require_feature
from apps.catalog.models import Product, ProductOption, ProductOptionValue, ProductVariant
from apps.catalog.selectors.options import LEGACY_PREFIX, label_key, normalise_label
from apps.common.exceptions import BusinessRuleViolationError

MAX_OPTIONS = 3


def build_title(values) -> str:
    ordered = sorted(values, key=lambda value: value.option.position)
    return " / ".join(value.value for value in ordered)


def lock_product(product: Product) -> Product:
    """Serialises option and variant writes of one product, so two saves cannot
    both pass the combination check."""
    return Product.objects.select_for_update().select_related("category").get(pk=product.pk)


def sync_product_type(product: Product) -> None:
    if product.product_type == Product.ProductType.BUNDLE:
        return
    has_options = product.options.exists() or (
        # Legacy colour/size text; dead once `move_colour_size_to_options` has run.
        product.variants.filter(deleted_at__isnull=True).exclude(color="", size="").exists()
    )
    wanted = Product.ProductType.VARIANT if has_options else Product.ProductType.SIMPLE
    if product.product_type != wanted:
        product.product_type = wanted
        product.save(update_fields=["product_type", "updated_at"])


def refresh_variant_titles(product: Product) -> None:
    changed = []
    for variant in product.variants.prefetch_related("option_values__option"):
        title = build_title(variant.option_values.all())
        if title != variant.title:
            variant.title = title
            changed.append(variant)
    ProductVariant.objects.bulk_update(changed, ["title"])


def resolve_combination(product: Product, option_value_ids) -> list[ProductOptionValue]:
    """The values behind `option_value_ids`, in option order: one per option of the product."""
    ids = [str(value_id) for value_id in option_value_ids or []]
    values = list(ProductOptionValue.objects.filter(id__in=ids).select_related("option"))
    if len(values) != len(set(ids)) or any(
        value.option.product_id != product.id for value in values
    ):
        raise BusinessRuleViolationError(
            "These option values do not belong to this product.", code="invalid_target"
        )
    option_ids = sorted(product.options.values_list("id", flat=True))
    if len(ids) != len(set(ids)) or sorted(value.option_id for value in values) != option_ids:
        raise BusinessRuleViolationError(
            "Pick exactly one value for every option of the product.",
            code="variant_options_incomplete",
        )
    return sorted(values, key=lambda value: value.option.position)


def ensure_combination_free(product: Product, values, *, exclude=None) -> None:
    target = {value.id for value in values}
    live = product.variants.filter(deleted_at__isnull=True).prefetch_related("option_values")
    if exclude is not None:
        live = live.exclude(pk=exclude.pk)
    for variant in live:
        if {value.id for value in variant.option_values.all()} == target:
            message = (
                "This combination already exists on the product."
                if target
                else "A product without options has one variant. Add an option first."
            )
            raise BusinessRuleViolationError(message, code="variant_combination_exists")


def _clean_values(raw_values: list) -> list[dict]:
    values = [
        {"id": str(item["id"]) if item.get("id") else None, "value": normalise_label(item["value"])}
        for item in raw_values or []
    ]
    values = [item for item in values if item["value"]]
    if not values:
        raise BusinessRuleViolationError(
            "Every option needs at least one value.", code="option_needs_value"
        )
    keys = Counter(label_key(item["value"]) for item in values)
    if any(count > 1 for count in keys.values()):
        raise BusinessRuleViolationError(
            "The same value is listed twice under one option.", code="option_value_exists"
        )
    return values


def _clean_options(raw_options: list) -> list[dict]:
    if len(raw_options) > MAX_OPTIONS:
        raise BusinessRuleViolationError(
            f"A product takes at most {MAX_OPTIONS} options.", code="option_limit_reached"
        )
    options = []
    for item in raw_options:
        name = normalise_label(item.get("name"))
        if not name:
            raise BusinessRuleViolationError("An option needs a name.", code="validation_error")
        options.append(
            {
                "id": str(item["id"]) if item.get("id") else None,
                "name": name,
                "default_value": normalise_label(item.get("default_value")),
                "values": _clean_values(item.get("values")),
            }
        )
    names = Counter(label_key(item["name"]) for item in options)
    if any(count > 1 for count in names.values()):
        raise BusinessRuleViolationError(
            "Two options have the same name.", code="option_name_exists"
        )
    return options


def _match_existing(options: list[dict], existing: dict[str, ProductOption]) -> None:
    """Every `id` in the payload must name an option, or a value, of this product."""
    stale = BusinessRuleViolationError(
        "An option or value in this save does not belong to this product.", code="invalid_target"
    )
    given = [item["id"] for item in options if item["id"]]
    if any(option_id.startswith(LEGACY_PREFIX) for option_id in given):
        raise BusinessRuleViolationError(
            "This product still carries old colour/size text. Run "
            "move_colour_size_to_options before editing its options.",
            code="invalid_target",
        )
    if len(given) != len(set(given)) or any(option_id not in existing for option_id in given):
        raise stale
    for item in options:
        value_ids = [value["id"] for value in item["values"] if value["id"]]
        known = (
            {str(value.id) for value in existing[item["id"]].values.all()} if item["id"] else set()
        )
        if len(value_ids) != len(set(value_ids)) or any(vid not in known for vid in value_ids):
            raise stale


def _check_defaults(options: list[dict], *, has_variants: bool) -> None:
    for item in options:
        if item["id"] or not has_variants:
            continue
        keys = {label_key(value["value"]) for value in item["values"]}
        if not item["default_value"] or label_key(item["default_value"]) not in keys:
            raise BusinessRuleViolationError(
                f"Say which value of {item['name']} the existing variants get.",
                code="option_default_required",
            )


def _rename(rows: list[tuple], field: str) -> None:
    """Two passes, so swapping two names never trips the unique index half-way."""
    changing = [(row, new) for row, new in rows if getattr(row, field) != new]
    for row, _new in changing:
        setattr(row, field, f"~{row.id.hex[:16]}")
        row.save(update_fields=[field, "updated_at"])
    for row, new in changing:
        setattr(row, field, new)
        row.save(update_fields=[field, "updated_at"])


def _write_options(
    product: Product, options: list[dict], existing: dict[str, ProductOption], live: list
) -> None:
    kept_ids = {item["id"] for item in options if item["id"]}
    ProductOption.objects.filter(
        id__in=[option.id for key, option in existing.items() if key not in kept_ids]
    ).delete()
    _rename([(existing[item["id"]], item["name"]) for item in options if item["id"]], "name")

    for position, item in enumerate(options):
        if item["id"]:
            option = existing[item["id"]]
            if option.position != position:
                option.position = position
                option.save(update_fields=["position", "updated_at"])
            stored = {str(value.id): value for value in option.values.all()}
        else:
            option = ProductOption.objects.create(
                product=product, name=item["name"], position=position
            )
            stored = {}
        kept_values = {value["id"] for value in item["values"] if value["id"]}
        ProductOptionValue.objects.filter(
            id__in=[value.id for key, value in stored.items() if key not in kept_values]
        ).delete()
        _rename(
            [(stored[value["id"]], value["value"]) for value in item["values"] if value["id"]],
            "value",
        )
        default = None
        for value_position, value in enumerate(item["values"]):
            if value["id"]:
                row = stored[value["id"]]
                if row.position != value_position:
                    row.position = value_position
                    row.save(update_fields=["position", "updated_at"])
            else:
                row = ProductOptionValue.objects.create(
                    option=option, value=value["value"], position=value_position
                )
            if label_key(value["value"]) == label_key(item["default_value"]):
                default = row
        if not item["id"] and default is not None:
            for variant in live:
                variant.option_values.add(default)


@transaction.atomic
def set_product_options(*, product: Product, options: list[dict], actor=None) -> Product:
    """Save the whole option set of a product: items with an id are kept, items
    without are created, items left out are removed. List order is position."""
    require_feature(ModuleKey.CATALOG, "product_variations")
    product = lock_product(product)
    options = _clean_options(options)
    if options and product.product_type == Product.ProductType.BUNDLE:
        raise BusinessRuleViolationError("A bundle takes no options.", code="bundle_no_options")
    existing = {str(option.id): option for option in product.options.prefetch_related("values")}
    _match_existing(options, existing)

    live = list(product.variants.filter(deleted_at__isnull=True).prefetch_related("option_values"))
    kept_option_ids = {item["id"] for item in options if item["id"]}
    kept_value_ids = {value["id"] for item in options for value in item["values"] if value["id"]}
    removed_options = {option.id for key, option in existing.items() if key not in kept_option_ids}
    removed_values = {
        value.id
        for key, option in existing.items()
        if key in kept_option_ids
        for value in option.values.all()
        if str(value.id) not in kept_value_ids
    }
    if any(value.id in removed_values for variant in live for value in variant.option_values.all()):
        raise BusinessRuleViolationError(
            "A variant still uses a value you removed. Delete or change that variant first.",
            code="option_value_in_use",
        )
    _check_defaults(options, has_variants=bool(live))
    remaining = {
        frozenset(
            value.id
            for value in variant.option_values.all()
            if value.option_id not in removed_options
        )
        for variant in live
    }
    if len(remaining) < len(live):
        if removed_options:
            raise BusinessRuleViolationError(
                "Removing this option would leave two variants that are the same. "
                "Delete the extra variants first.",
                code="option_removal_makes_duplicates",
            )
        raise BusinessRuleViolationError(
            "This product has several variants without options. Run "
            "move_colour_size_to_options before adding options to it.",
            code="variant_combination_exists",
        )

    _write_options(product, options, existing, live)
    refresh_variant_titles(product)
    sync_product_type(product)
    log_action(
        actor=actor,
        action="product.options_changed",
        target_type="Product",
        target_id=product.id,
        metadata={"options": [item["name"] for item in options]},
    )
    return product


@transaction.atomic
def ensure_option_values(product: Product, pairs: list[tuple[str, str]]) -> list:
    """Value ids for (option name, value) pairs, adding what the product lacks.
    For imports: a new value joins its option; a new option is only possible
    while the product has no variant to give a default to."""
    require_feature(ModuleKey.CATALOG, "product_variations")
    options = {label_key(option.name): option for option in product.options.all()}
    has_variants = product.variants.filter(deleted_at__isnull=True).exists()
    ids = []
    for raw_name, raw_value in pairs:
        name, value = normalise_label(raw_name), normalise_label(raw_value)
        option = options.get(label_key(name))
        if option is None:
            if has_variants:
                raise BusinessRuleViolationError(
                    f"The product has no option called {name}. Add it on the product page, "
                    "where the existing variants get a value.",
                    code="option_default_required",
                )
            if len(options) >= MAX_OPTIONS:
                raise BusinessRuleViolationError(
                    f"A product takes at most {MAX_OPTIONS} options.",
                    code="option_limit_reached",
                )
            option = ProductOption.objects.create(product=product, name=name, position=len(options))
            options[label_key(name)] = option
        row = option.values.filter(value__iexact=value).first()
        if row is None:
            row = ProductOptionValue.objects.create(
                option=option, value=value, position=option.values.count()
            )
        ids.append(row.id)
    return ids


def _shop_option_name(name, *, option: ProductOption | None = None) -> str:
    name = normalise_label(name)
    if not name:
        raise BusinessRuleViolationError("An option needs a name.", code="validation_error")
    taken = ProductOption.objects.filter(product__isnull=True, name__iexact=name)
    if option is not None:
        taken = taken.exclude(pk=option.pk)
    if taken.exists():
        raise BusinessRuleViolationError(
            "There is already an option with this name.", code="option_name_exists"
        )
    return name


def _write_shop_values(option: ProductOption, raw_values: list) -> None:
    values = _clean_values([{"value": value} for value in raw_values or []])
    # No variant or image points at a shop option's value, so a save replaces the list.
    option.values.all().delete()
    ProductOptionValue.objects.bulk_create(
        ProductOptionValue(option=option, value=item["value"], position=position)
        for position, item in enumerate(values)
    )


@transaction.atomic
def create_shop_option(*, name: str, values: list, actor=None) -> ProductOption:
    require_feature(ModuleKey.CATALOG, "product_variations")
    option = ProductOption.objects.create(name=_shop_option_name(name))
    _write_shop_values(option, values)
    log_action(
        actor=actor,
        action="option.created",
        target_type="ProductOption",
        target_id=option.id,
        metadata={"name": option.name},
    )
    return option


@transaction.atomic
def update_shop_option(*, option: ProductOption, data: dict, actor=None) -> ProductOption:
    """Products that picked this option hold their own copy, so they do not change."""
    require_feature(ModuleKey.CATALOG, "product_variations")
    if "name" in data:
        option.name = _shop_option_name(data["name"], option=option)
        option.save(update_fields=["name"])
    if "values" in data:
        _write_shop_values(option, data["values"])
    if "is_active" in data:
        option.is_active = data["is_active"]
        option.save(update_fields=["is_active"])
    log_action(
        actor=actor,
        action="option.updated",
        target_type="ProductOption",
        target_id=option.id,
        metadata={"fields": [field for field in ("name", "values", "is_active") if field in data]},
    )
    return option


@transaction.atomic
def delete_shop_option(*, option: ProductOption, actor=None) -> None:
    log_action(
        actor=actor,
        action="option.deleted",
        target_type="ProductOption",
        target_id=option.id,
        metadata={"name": option.name},
    )
    option.delete()
