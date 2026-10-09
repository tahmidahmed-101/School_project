from __future__ import annotations

import io
from decimal import Decimal

import pytest

from apps.business.constants import ModuleKey
from apps.business.services.modules import set_module_config
from apps.catalog.factories import (
    CategoryFactory,
    ProductFactory,
    ProductImageFactory,
    ProductVariantFactory,
    make_options,
    make_variant,
)
from apps.catalog.models import Product, ProductOptionValue, ProductVariant
from apps.catalog.selectors.options import (
    missing_combination_count,
    product_combinations,
    product_options,
    variant_option_values,
    variant_title,
)
from apps.catalog.services.options import set_product_options
from apps.catalog.services.products import (
    create_product,
    create_variant,
    delete_variant,
    update_variant,
)
from apps.catalog.services.variant_import_export import export_variants, import_variants
from apps.catalog.services.variants import bulk_update_variants, generate_variants
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.orders.factories import SalesOrderLineFactory

pytestmark = pytest.mark.django_db

BASE = "/api/v1/admin/catalog/"


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


def _options(*items) -> list[dict]:
    return [
        {"name": name, "values": [{"value": value} for value in values]} for name, values in items
    ]


def _tee():
    """A product with Colour (Red, Blue) x Size (S, M) and all four variants."""
    return create_product(
        category=CategoryFactory(),
        name="Tee",
        price=Decimal("500.00"),
        options=[
            {"name": "Colour", "values": ["Red", "Blue"]},
            {"name": "Size", "values": ["S", "M"]},
        ],
    )


def _value(product, text) -> ProductOptionValue:
    return ProductOptionValue.objects.get(option__product=product, value=text)


def _code(excinfo) -> str:
    return excinfo.value.code


# --- option rules ------------------------------------------------------------


def test_options_are_stored_trimmed_in_the_order_given_with_the_casing_typed():
    product = ProductFactory()

    set_product_options(
        product=product, options=_options(("  Colour ", ["  Dark   Red ", "blue"]), ("Size", ["M"]))
    )

    assert [(option["name"], option["position"]) for option in product_options(product)] == [
        ("Colour", 0),
        ("Size", 1),
    ]
    assert [value["value"] for value in product_options(product)[0]["values"]] == [
        "Dark Red",
        "blue",
    ]


def test_a_fourth_option_is_refused():
    with pytest.raises(BusinessRuleViolationError) as exc:
        set_product_options(
            product=ProductFactory(),
            options=_options(("A", ["1"]), ("B", ["1"]), ("C", ["1"]), ("D", ["1"])),
        )
    assert _code(exc) == "option_limit_reached"


def test_two_options_with_the_same_name_in_another_casing_are_refused():
    with pytest.raises(BusinessRuleViolationError) as exc:
        set_product_options(
            product=ProductFactory(), options=_options(("Size", ["M"]), (" size", ["L"]))
        )
    assert _code(exc) == "option_name_exists"


def test_the_same_value_twice_under_an_option_is_refused():
    with pytest.raises(BusinessRuleViolationError) as exc:
        set_product_options(product=ProductFactory(), options=_options(("Colour", ["Red", "red "])))
    assert _code(exc) == "option_value_exists"


@pytest.mark.parametrize("values", [[], ["  "]])
def test_an_option_without_a_value_is_refused(values):
    with pytest.raises(BusinessRuleViolationError) as exc:
        set_product_options(product=ProductFactory(), options=_options(("Colour", values)))
    assert _code(exc) == "option_needs_value"


def test_a_bundle_takes_no_options():
    bundle = ProductFactory(product_type=Product.ProductType.BUNDLE)

    with pytest.raises(BusinessRuleViolationError) as exc:
        set_product_options(product=bundle, options=_options(("Size", ["M"])))
    assert _code(exc) == "bundle_no_options"

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_product(
            category=CategoryFactory(),
            name="Gift box",
            product_type=Product.ProductType.BUNDLE,
            price=Decimal("10.00"),
            options=[{"name": "Size", "values": ["M"]}],
        )
    assert _code(exc) == "bundle_no_options"


def test_option_writes_are_refused_while_variations_are_switched_off():
    product = ProductFactory()
    set_module_config(key=ModuleKey.CATALOG, config={"product_variations": False})

    with pytest.raises(BusinessRuleViolationError) as exc:
        set_product_options(product=product, options=_options(("Size", ["M"])))
    assert _code(exc) == "feature_disabled"


def test_an_option_added_to_a_product_with_variants_needs_a_default_value():
    variant = ProductVariantFactory()
    product = variant.product

    for default in ("", "XL"):
        with pytest.raises(BusinessRuleViolationError) as exc:
            set_product_options(
                product=product,
                options=[{"name": "Size", "default_value": default, "values": [{"value": "M"}]}],
            )
        assert _code(exc) == "option_default_required"

    set_product_options(
        product=product,
        options=[
            {"name": "Size", "default_value": "m", "values": [{"value": "M"}, {"value": "L"}]}
        ],
    )

    variant.refresh_from_db()
    product.refresh_from_db()
    assert variant.title == "M"
    assert [pair["value"] for pair in variant_option_values(variant)] == ["M"]
    assert product.product_type == Product.ProductType.VARIANT


def test_a_second_option_gives_every_existing_variant_its_default_and_rebuilds_titles():
    product = _tee()
    kept = [
        {"id": option["id"], "name": option["name"], "values": option["values"]}
        for option in product_options(product)
    ]

    set_product_options(
        product=product,
        options=[
            *kept,
            {"name": "Fit", "default_value": "Regular", "values": [{"value": "Regular"}]},
        ],
    )

    titles = sorted(product.variants.values_list("title", flat=True))
    assert titles == [
        "Blue / M / Regular",
        "Blue / S / Regular",
        "Red / M / Regular",
        "Red / S / Regular",
    ]


def test_removing_a_value_a_live_variant_uses_is_refused():
    product = _tee()
    colour, size = product_options(product)
    colour["values"] = [value for value in colour["values"] if value["value"] != "Blue"]

    with pytest.raises(BusinessRuleViolationError) as exc:
        set_product_options(product=product, options=[colour, size])
    assert _code(exc) == "option_value_in_use"


def test_a_value_no_live_variant_uses_can_be_removed():
    product = _tee()
    for variant in product.variants.filter(title__startswith="Blue"):
        delete_variant(variant=variant)
    colour, size = product_options(product)
    colour["values"] = [value for value in colour["values"] if value["value"] != "Blue"]

    set_product_options(product=product, options=[colour, size])

    assert [value["value"] for value in product_options(product)[0]["values"]] == ["Red"]


def test_removing_an_option_that_would_leave_two_same_variants_is_refused():
    product = _tee()
    colour, _size = product_options(product)

    with pytest.raises(BusinessRuleViolationError) as exc:
        set_product_options(product=product, options=[colour])
    assert _code(exc) == "option_removal_makes_duplicates"


def test_removing_the_last_option_of_a_product_with_two_variants_is_refused():
    product = create_product(
        category=CategoryFactory(),
        name="Cap",
        price=Decimal("90.00"),
        options=[{"name": "Size", "values": ["S", "M"]}],
    )

    with pytest.raises(BusinessRuleViolationError) as exc:
        set_product_options(product=product, options=[])
    assert _code(exc) == "option_removal_makes_duplicates"


def test_removing_an_option_takes_its_value_off_every_variant():
    product = create_product(
        category=CategoryFactory(),
        name="Mug",
        price=Decimal("90.00"),
        options=[{"name": "Colour", "values": ["Red", "Blue"]}, {"name": "Size", "values": ["S"]}],
    )
    colour, _size = product_options(product)

    set_product_options(product=product, options=[colour])

    assert sorted(product.variants.values_list("title", flat=True)) == ["Blue", "Red"]

    for variant in product.variants.filter(title="Blue"):
        delete_variant(variant=variant)
    set_product_options(product=product, options=[])
    product.refresh_from_db()

    assert product.variants.get(deleted_at__isnull=True).title == ""
    assert product.product_type == Product.ProductType.SIMPLE


def test_renaming_and_reordering_rebuilds_every_title():
    product = _tee()
    colour, size = product_options(product)
    colour["values"][0]["value"] = "Crimson"
    size["name"] = "Fit"

    set_product_options(product=product, options=[size, colour])

    assert sorted(product.variants.values_list("title", flat=True)) == [
        "M / Blue",
        "M / Crimson",
        "S / Blue",
        "S / Crimson",
    ]
    assert [option["name"] for option in product_options(product)] == ["Fit", "Colour"]


def test_two_values_can_swap_names_in_one_save():
    product = _tee()
    colour, size = product_options(product)
    colour["values"][0]["value"], colour["values"][1]["value"] = "Blue", "Red"

    set_product_options(product=product, options=[colour, size])

    assert [value["value"] for value in product_options(product)[0]["values"]] == ["Blue", "Red"]


def test_an_id_of_another_product_is_refused():
    product = _tee()
    other = _tee()
    foreign = product_options(other)[0]

    with pytest.raises(BusinessRuleViolationError) as exc:
        set_product_options(product=product, options=[foreign])
    assert _code(exc) == "invalid_target"


# --- variant rules -----------------------------------------------------------


def test_a_variant_needs_one_value_of_every_option():
    product = _tee()

    for ids in ([], [_value(product, "Red").id], [_value(product, "Red").id] * 2):
        with pytest.raises(BusinessRuleViolationError) as exc:
            create_variant(product=product, option_value_ids=ids)
        assert _code(exc) == "variant_options_incomplete"

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_variant(
            product=product,
            option_value_ids=[_value(product, "Red").id, _value(product, "Blue").id],
        )
    assert _code(exc) == "variant_options_incomplete"


def test_a_value_of_another_product_is_refused():
    product = _tee()
    other = _tee()

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_variant(
            product=product, option_value_ids=[_value(product, "Red").id, _value(other, "S").id]
        )
    assert _code(exc) == "invalid_target"


def test_an_existing_combination_is_refused_and_a_deleted_one_is_free_again():
    product = _tee()
    ids = [_value(product, "Red").id, _value(product, "S").id]
    first = product.variants.get(title="Red / S")

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_variant(product=product, option_value_ids=ids)
    assert _code(exc) == "variant_combination_exists"

    delete_variant(variant=first)
    replacement = create_variant(product=product, option_value_ids=ids)

    first.refresh_from_db()
    assert first.deleted_at is not None
    assert first.is_active is False
    assert first.sku == "TEE-RED-S"
    assert replacement.sku == "TEE-RED-S-2"
    assert replacement.title == "Red / S"


def test_the_same_combination_on_another_product_is_fine():
    assert _tee().variants.count() == _tee().variants.count() == 4


def test_a_variant_can_move_to_a_free_combination_but_not_onto_a_taken_one():
    product = _tee()
    variant = product.variants.get(title="Red / S")
    delete_variant(variant=product.variants.get(title="Blue / S"))

    with pytest.raises(BusinessRuleViolationError) as exc:
        update_variant(
            variant=variant,
            data={"option_value_ids": [_value(product, "Red").id, _value(product, "M").id]},
        )
    assert _code(exc) == "variant_combination_exists"

    update_variant(
        variant=variant,
        data={"option_value_ids": [_value(product, "Blue").id, _value(product, "S").id]},
    )
    variant.refresh_from_db()
    assert variant.title == "Blue / S"


def test_a_variant_on_an_order_line_keeps_its_options_and_sku():
    product = _tee()
    variant = product.variants.get(title="Red / S")
    delete_variant(variant=product.variants.get(title="Blue / S"))
    SalesOrderLineFactory(variant=variant)

    with pytest.raises(BusinessRuleViolationError) as exc:
        update_variant(
            variant=variant,
            data={"option_value_ids": [_value(product, "Blue").id, _value(product, "S").id]},
        )
    assert _code(exc) == "variant_in_use"

    with pytest.raises(BusinessRuleViolationError) as exc:
        update_variant(variant=variant, data={"sku": "NEW-SKU"})
    assert _code(exc) == "variant_in_use"

    same = [_value(product, "Red").id, _value(product, "S").id]
    updated = update_variant(
        variant=variant, data={"option_value_ids": same, "sku": variant.sku, "price": Decimal("9")}
    )
    assert updated.price == Decimal("9")


def test_the_last_live_variant_cannot_be_deleted():
    variant = ProductVariantFactory()

    with pytest.raises(BusinessRuleViolationError) as exc:
        delete_variant(variant=variant)
    assert _code(exc) == "last_variant"


def test_a_variant_with_stock_cannot_be_deleted():
    product = _tee()
    variant = product.variants.get(title="Red / S")
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=3,
        unit_cost=Decimal("10"),
    )

    with pytest.raises(BusinessRuleViolationError) as exc:
        delete_variant(variant=variant)
    assert _code(exc) == "product_stock_in_use"


# --- product create, generate, bulk update -----------------------------------


def test_create_product_makes_only_the_listed_combinations():
    product = create_product(
        category=CategoryFactory(),
        name="Polo",
        price=Decimal("700.00"),
        cost_price=Decimal("300.00"),
        options=[
            {"name": "Colour", "values": ["Red", "Blue"]},
            {"name": "Size", "values": ["S", "M"]},
        ],
        combinations=[["red", "S"], ["Blue", "M"]],
    )

    assert product.product_type == Product.ProductType.VARIANT
    assert sorted(product.variants.values_list("title", "sku", "price", "cost_price")) == [
        ("Blue / M", "POLO-BLUE-M", Decimal("700.00"), Decimal("300.00")),
        ("Red / S", "POLO-RED-S", Decimal("700.00"), Decimal("300.00")),
    ]
    assert missing_combination_count(product) == 2


def test_create_product_with_options_needs_a_price_and_known_values():
    with pytest.raises(BusinessRuleViolationError) as exc:
        create_product(
            category=CategoryFactory(), name="Polo", options=[{"name": "Size", "values": ["S"]}]
        )
    assert _code(exc) == "price_required"

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_product(
            category=CategoryFactory(),
            name="Polo",
            price=Decimal("1.00"),
            options=[{"name": "Size", "values": ["S"]}],
            combinations=[["XL"]],
        )
    assert _code(exc) == "invalid_target"


def test_combinations_list_every_combination_in_option_order_with_its_variant():
    product = _tee()
    delete_variant(variant=product.variants.get(title="Blue / S"))

    rows = product_combinations(product)

    assert [row["title"] for row in rows] == ["Red / S", "Red / M", "Blue / S", "Blue / M"]
    assert [row["variant_id"] is None for row in rows] == [False, False, True, False]
    assert rows[0]["value_ids"] == [_value(product, "Red").id, _value(product, "S").id]


def test_generate_creates_all_missing_combinations_at_the_first_variants_price():
    product = create_product(
        category=CategoryFactory(),
        name="Polo",
        price=Decimal("700.00"),
        cost_price=Decimal("300.00"),
        options=[
            {"name": "Colour", "values": ["Red", "Blue"]},
            {"name": "Size", "values": ["S", "M"]},
        ],
        combinations=[["Red", "S"]],
    )

    created = generate_variants(product=product)

    assert [variant.title for variant in created] == ["Red / M", "Blue / S", "Blue / M"]
    assert {(variant.price, variant.cost_price) for variant in created} == {
        (Decimal("700.00"), Decimal("300.00"))
    }
    assert generate_variants(product=product) == []


def test_generate_creates_the_listed_combinations_and_skips_an_existing_one():
    product = create_product(
        category=CategoryFactory(),
        name="Polo",
        price=Decimal("700.00"),
        options=[{"name": "Size", "values": ["S", "M", "L"]}],
        combinations=[["S"]],
    )

    created = generate_variants(
        product=product,
        combinations=[[_value(product, "S").id], [_value(product, "L").id]],
        price=Decimal("750.00"),
        cost_price=Decimal("10.00"),
    )

    assert [(variant.title, variant.price, variant.cost_price) for variant in created] == [
        ("L", Decimal("750.00"), Decimal("10.00"))
    ]

    with pytest.raises(BusinessRuleViolationError) as exc:
        generate_variants(product=product, combinations=[[_value(_tee(), "S").id]])
    assert _code(exc) == "invalid_target"


def test_bulk_update_sets_the_fields_on_the_listed_variants_or_on_all():
    product = _tee()
    red = list(product.variants.filter(title__startswith="Red"))

    bulk_update_variants(
        product=product, variant_ids=[variant.id for variant in red], data={"price": Decimal("650")}
    )
    assert sorted(product.variants.values_list("price", flat=True)) == [
        Decimal("500.00"),
        Decimal("500.00"),
        Decimal("650.00"),
        Decimal("650.00"),
    ]

    updated = bulk_update_variants(
        product=product, data={"is_active": False, "cost_price": Decimal("200")}
    )
    assert len(updated) == 4
    assert set(product.variants.values_list("is_active", "cost_price")) == {
        (False, Decimal("200.00"))
    }


def test_bulk_update_refuses_a_variant_of_another_product_and_a_bad_discount():
    product = _tee()
    stranger = ProductVariantFactory()

    with pytest.raises(BusinessRuleViolationError) as exc:
        bulk_update_variants(
            product=product, variant_ids=[stranger.id], data={"price": Decimal("1")}
        )
    assert _code(exc) == "invalid_target"

    with pytest.raises(BusinessRuleViolationError) as exc:
        bulk_update_variants(product=product, data={"discount_price": Decimal("500.00")})
    assert _code(exc) == "discount_not_below_price"
    assert set(product.variants.values_list("discount_price", flat=True)) == {None}


# --- transition rule: legacy colour/size text --------------------------------


def _legacy_product():
    product = ProductFactory(is_active=True, product_type=Product.ProductType.VARIANT)
    ProductVariantFactory(product=product, sku="OLD-1", color="Red", size="M")
    ProductVariantFactory(product=product, sku="OLD-2", color=" red ", size="L")
    return product


def test_legacy_text_reads_as_synthetic_options():
    product = _legacy_product()
    variant = product.variants.get(sku="OLD-2")

    assert product_options(product) == [
        {
            "id": "legacy:colour",
            "name": "Colour",
            "position": 0,
            "values": [{"id": "legacy:colour:red", "value": "Red", "position": 0}],
        },
        {
            "id": "legacy:size",
            "name": "Size",
            "position": 1,
            "values": [
                {"id": "legacy:size:m", "value": "M", "position": 0},
                {"id": "legacy:size:l", "value": "L", "position": 1},
            ],
        },
    ]
    assert variant_title(variant) == "red / L"
    assert variant_option_values(variant) == [
        {
            "option_id": "legacy:colour",
            "option_name": "Colour",
            "value_id": "legacy:colour:red",
            "value": "red",
        },
        {
            "option_id": "legacy:size",
            "option_name": "Size",
            "value_id": "legacy:size:l",
            "value": "L",
        },
    ]


def test_public_product_answers_legacy_text_as_options(api_client):
    product = _legacy_product()

    data = api_client.get(f"/api/v1/public/catalog/products/{product.slug}/").data["data"]

    assert data["options"] == [
        {
            "id": "legacy:colour",
            "name": "Colour",
            "values": [{"id": "legacy:colour:red", "value": "Red"}],
        },
        {
            "id": "legacy:size",
            "name": "Size",
            "values": [
                {"id": "legacy:size:m", "value": "M"},
                {"id": "legacy:size:l", "value": "L"},
            ],
        },
    ]
    by_sku = {variant["sku"]: variant for variant in data["variants"]}
    assert by_sku["OLD-1"]["option_value_ids"] == ["legacy:colour:red", "legacy:size:m"]
    assert by_sku["OLD-1"]["title"] == "Red / M"
    assert (by_sku["OLD-1"]["color"], by_sku["OLD-1"]["size"]) == ("Red", "M")


def test_editing_the_options_of_a_legacy_product_is_refused_until_the_command_has_run():
    product = _legacy_product()

    with pytest.raises(BusinessRuleViolationError) as exc:
        set_product_options(product=product, options=product_options(product))
    assert _code(exc) == "invalid_target"

    with pytest.raises(BusinessRuleViolationError) as exc:
        set_product_options(
            product=product,
            options=[{"name": "Fit", "default_value": "Slim", "values": [{"value": "Slim"}]}],
        )
    assert _code(exc) == "variant_combination_exists"


# --- admin API ---------------------------------------------------------------


def test_admin_product_read_carries_options_and_variant_option_values(admin_client):
    product = _tee()

    data = admin_client.get(f"{BASE}products/{product.id}/").data["data"]

    red, small = _value(product, "Red"), _value(product, "S")
    assert data["product_type"] == "variant"
    assert data["options"][0] == {
        "id": str(red.option_id),
        "name": "Colour",
        "position": 0,
        "values": [
            {"id": str(red.id), "value": "Red", "position": 0},
            {"id": str(_value(product, "Blue").id), "value": "Blue", "position": 1},
        ],
    }
    variant = next(row for row in data["variants"] if row["title"] == "Red / S")
    assert variant["option_values"] == [
        {
            "option_id": str(red.option_id),
            "option_name": "Colour",
            "value_id": str(red.id),
            "value": "Red",
        },
        {
            "option_id": str(small.option_id),
            "option_name": "Size",
            "value_id": str(small.id),
            "value": "S",
        },
    ]
    assert (variant["color"], variant["size"]) == ("Red", "S")


def test_admin_options_put_saves_the_set_and_counts_missing_combinations(admin_client):
    product = ProductFactory()
    ProductVariantFactory(product=product)

    response = admin_client.put(
        f"{BASE}products/{product.id}/options/",
        {
            "options": [
                {
                    "name": "Size",
                    "default_value": "M",
                    "values": [{"value": "M"}, {"value": "L"}, {"value": "XL"}],
                }
            ]
        },
        format="json",
    )

    assert response.status_code == 200, response.data
    data = response.data["data"]
    assert data["missing_combinations"] == 2
    assert [value["value"] for value in data["options"][0]["values"]] == ["M", "L", "XL"]
    assert set(data["options"][0]) == {"id", "name", "position", "values"}

    renamed = data["options"]
    renamed[0]["name"] = "Fit"
    response = admin_client.put(
        f"{BASE}products/{product.id}/options/", {"options": renamed}, format="json"
    )
    assert response.status_code == 200, response.data
    assert response.data["data"]["options"][0]["name"] == "Fit"
    assert response.data["data"]["options"][0]["id"] == data["options"][0]["id"]


@pytest.mark.parametrize(
    ("options", "status", "code"),
    [
        ([{"name": "Size", "values": [{"value": "M"}]}], 400, "option_default_required"),
        ([{"name": "Size", "default_value": "M", "values": []}], 400, "option_needs_value"),
        (
            [
                {"name": "Size", "default_value": "M", "values": [{"value": "M"}]},
                {"name": "size", "default_value": "M", "values": [{"value": "M"}]},
            ],
            409,
            "option_name_exists",
        ),
        (
            [{"name": "Size", "default_value": "M", "values": [{"value": "M"}, {"value": "m"}]}],
            409,
            "option_value_exists",
        ),
        (
            [
                {"name": name, "default_value": "1", "values": [{"value": "1"}]}
                for name in ("A", "B", "C", "D")
            ],
            400,
            "option_limit_reached",
        ),
    ],
)
def test_admin_options_put_answers_each_refusal_with_its_code(admin_client, options, status, code):
    variant = ProductVariantFactory()

    response = admin_client.put(
        f"{BASE}products/{variant.product_id}/options/", {"options": options}, format="json"
    )

    assert response.status_code == status, response.data
    assert response.data["error"]["code"] == code


def test_admin_options_put_refuses_a_used_value_and_a_duplicating_removal(admin_client):
    product = _tee()
    colour, size = admin_client.get(f"{BASE}products/{product.id}/").data["data"]["options"]

    response = admin_client.put(
        f"{BASE}products/{product.id}/options/",
        {"options": [{**colour, "values": colour["values"][:1]}, size]},
        format="json",
    )
    assert (response.status_code, response.data["error"]["code"]) == (409, "option_value_in_use")

    response = admin_client.put(
        f"{BASE}products/{product.id}/options/", {"options": [colour]}, format="json"
    )
    assert (response.status_code, response.data["error"]["code"]) == (
        400,
        "option_removal_makes_duplicates",
    )


def test_admin_combinations_endpoint(admin_client):
    product = _tee()
    gone = product.variants.get(title="Blue / M")
    delete_variant(variant=gone)

    rows = admin_client.get(f"{BASE}products/{product.id}/combinations/").data["data"][
        "combinations"
    ]

    assert [row["title"] for row in rows] == ["Red / S", "Red / M", "Blue / S", "Blue / M"]
    assert rows[3] == {
        "value_ids": [str(_value(product, "Blue").id), str(_value(product, "M").id)],
        "title": "Blue / M",
        "variant_id": None,
    }
    assert rows[0]["variant_id"] == str(product.variants.get(title="Red / S").id)


def test_admin_generate_creates_the_listed_combinations(admin_client):
    product = _tee()
    delete_variant(variant=product.variants.get(title="Blue / M"))
    delete_variant(variant=product.variants.get(title="Blue / S"))

    response = admin_client.post(
        f"{BASE}products/{product.id}/variants/generate/",
        {"combinations": [[str(_value(product, "Blue").id), str(_value(product, "M").id)]]},
        format="json",
    )

    assert response.status_code == 201, response.data
    created = response.data["data"]["created"]
    assert [(row["title"], row["price"]) for row in created] == [("Blue / M", "500.00")]
    assert set(response.data["data"]) == {"created"}


def test_admin_bulk_update(admin_client):
    product = _tee()

    response = admin_client.post(
        f"{BASE}products/{product.id}/variants/bulk-update/",
        {"price": "900.00", "discount_price": "800.00"},
        format="json",
    )

    assert response.status_code == 200, response.data
    assert {(row["price"], row["discount_price"]) for row in response.data["data"]["updated"]} == {
        ("900.00", "800.00")
    }
    assert len(response.data["data"]["updated"]) == 4

    response = admin_client.post(
        f"{BASE}products/{product.id}/variants/bulk-update/",
        {"variant_ids": [str(ProductVariantFactory().id)], "is_active": False},
        format="json",
    )
    assert response.data["error"]["code"] == "invalid_target"


def test_admin_variant_create_and_update_take_option_value_ids(admin_client):
    product = _tee()
    delete_variant(variant=product.variants.get(title="Blue / M"))
    delete_variant(variant=product.variants.get(title="Blue / S"))
    blue_m = [str(_value(product, "Blue").id), str(_value(product, "M").id)]
    blue_s = [str(_value(product, "Blue").id), str(_value(product, "S").id)]

    response = admin_client.post(
        f"{BASE}products/{product.id}/variants/",
        {"price": "510.00", "option_value_ids": blue_m},
        format="json",
    )
    assert response.status_code == 201, response.data
    assert response.data["data"]["title"] == "Blue / M"
    variant_id = response.data["data"]["id"]

    response = admin_client.patch(
        f"{BASE}variants/{variant_id}/", {"option_value_ids": blue_s}, format="json"
    )
    assert response.status_code == 200, response.data
    assert response.data["data"]["title"] == "Blue / S"

    response = admin_client.post(
        f"{BASE}products/{product.id}/variants/",
        {"price": "510.00", "option_value_ids": blue_s},
        format="json",
    )
    assert response.data["error"]["code"] == "variant_combination_exists"

    response = admin_client.post(
        f"{BASE}products/{product.id}/variants/",
        {"price": "510.00", "option_value_ids": blue_m[:1]},
        format="json",
    )
    assert response.data["error"]["code"] == "variant_options_incomplete"


def test_admin_variant_writes_no_longer_accept_colour_or_size(admin_client):
    product = _tee()
    variant = product.variants.first()

    response = admin_client.post(
        f"{BASE}products/{product.id}/variants/", {"price": "1.00", "color": "Red"}, format="json"
    )
    assert response.status_code == 400

    response = admin_client.patch(f"{BASE}variants/{variant.id}/", {"size": "M"}, format="json")
    assert response.status_code == 400


def test_admin_variant_delete_is_a_real_delete(admin_client):
    product = _tee()
    variant = product.variants.get(title="Red / S")

    assert admin_client.delete(f"{BASE}variants/{variant.id}/").status_code in (200, 204)

    variant.refresh_from_db()
    assert variant.deleted_at is not None
    rows = admin_client.get(f"{BASE}products/{product.id}/combinations/").data["data"][
        "combinations"
    ]
    assert rows[0]["variant_id"] is None

    last = ProductVariantFactory()
    response = admin_client.delete(f"{BASE}variants/{last.id}/")
    assert (response.status_code, response.data["error"]["code"]) == (400, "last_variant")


def test_admin_variants_list_rows_carry_title_and_search_matches_it(admin_client):
    product = _tee()

    response = admin_client.get(f"{BASE}variants/", {"search": "blue / m"})

    rows = response.data["data"]["results"]
    assert [row["title"] for row in rows] == ["Blue / M"]
    assert [pair["value"] for pair in rows[0]["option_values"]] == ["Blue", "M"]
    assert rows[0]["product_id"] == str(product.id)


def test_admin_product_create_with_options_and_combinations(admin_client):
    category = CategoryFactory()

    response = admin_client.post(
        f"{BASE}products/",
        {
            "category_id": str(category.id),
            "name": "Panjabi",
            "price": "1500.00",
            "options": [
                {"name": "Colour", "values": ["White", "Navy"]},
                {"name": "Size", "values": ["M", "L"]},
            ],
            "combinations": [["White", "M"], ["Navy", "L"]],
            "specs": [
                {"name": "Fabric", "value": "Cotton"},
                {"name": "Care", "value": "Hand wash"},
            ],
        },
        format="json",
    )

    assert response.status_code == 201, response.data
    data = response.data["data"]
    assert data["product_type"] == "variant"
    assert [option["name"] for option in data["options"]] == ["Colour", "Size"]
    assert sorted(row["title"] for row in data["variants"]) == ["Navy / L", "White / M"]
    assert data["specs"] == [
        {"name": "Fabric", "value": "Cotton"},
        {"name": "Care", "value": "Hand wash"},
    ]


def test_admin_product_type_is_not_writable_and_specs_are(admin_client):
    variant = ProductVariantFactory()
    url = f"{BASE}products/{variant.product_id}/"

    response = admin_client.patch(
        url,
        {"product_type": "variant", "specs": [{"name": "Weight", "value": "200 g"}]},
        format="json",
    )

    assert response.status_code == 200, response.data
    assert response.data["data"]["product_type"] == "simple"
    assert response.data["data"]["specs"] == [{"name": "Weight", "value": "200 g"}]

    response = admin_client.patch(
        url,
        {"specs": [{"name": "Weight", "value": "1"}, {"name": "weight", "value": "2"}]},
        format="json",
    )
    assert response.status_code == 400


def test_admin_option_suggestions_are_most_used_first(admin_client):
    for _ in range(2):
        make_options(ProductFactory(), {"Size": ["M", "L"]})
    make_options(ProductFactory(), {"Colour": ["Red"], "Size": ["M"]})

    names = admin_client.get(f"{BASE}option-suggestions/").data["data"]
    assert names == {"names": ["Size", "Colour"], "values": []}

    values = admin_client.get(f"{BASE}option-suggestions/", {"name": "size"}).data["data"]
    assert values == {"names": ["Size", "Colour"], "values": ["M", "L"]}


def test_admin_image_takes_an_option_value_of_its_product(admin_client):
    product = _tee()
    red = _value(product, "Red")

    response = admin_client.post(
        f"{BASE}products/{product.id}/images/",
        {"url": "https://cdn.test/red.jpg", "option_value_id": str(red.id)},
        format="json",
    )
    assert response.status_code == 201, response.data
    assert response.data["data"]["option_value_id"] == str(red.id)
    image_id = response.data["data"]["id"]

    response = admin_client.patch(
        f"{BASE}images/{image_id}/",
        {"option_value_id": str(_value(_tee(), "Red").id)},
        format="json",
    )
    assert response.data["error"]["code"] == "invalid_target"

    response = admin_client.patch(
        f"{BASE}images/{image_id}/", {"option_value_id": None}, format="json"
    )
    assert response.status_code == 200, response.data
    assert response.data["data"]["option_value_id"] is None


# --- public API --------------------------------------------------------------


def test_public_product_carries_sellable_options_highlights_and_ordered_specs(api_client):
    product = _tee()
    Product.objects.filter(pk=product.pk).update(
        is_active=True,
        highlights=["Pure cotton", "Made in Bangladesh"],
        specs=[{"name": "Fabric", "value": "Cotton"}, {"name": "Care", "value": "Hand wash"}],
    )
    product.variants.filter(title__startswith="Blue").update(is_active=False)
    delete_variant(variant=product.variants.get(title="Red / M"))
    red, small = _value(product, "Red"), _value(product, "S")
    ProductImageFactory(product=product, option_value=red, url="https://cdn.test/red.jpg")

    data = api_client.get(f"/api/v1/public/catalog/products/{product.slug}/").data["data"]

    assert data["options"] == [
        {
            "id": str(red.option_id),
            "name": "Colour",
            "values": [{"id": str(red.id), "value": "Red"}],
        },
        {
            "id": str(small.option_id),
            "name": "Size",
            "values": [{"id": str(small.id), "value": "S"}],
        },
    ]
    assert data["highlights"] == ["Pure cotton", "Made in Bangladesh"]
    assert list(data["specs"].items()) == [("Fabric", "Cotton"), ("Care", "Hand wash")]
    assert [
        (row["title"], row["option_value_ids"], row["color"], row["size"])
        for row in data["variants"]
    ] == [("Red / S", [str(red.id), str(small.id)], "Red", "S")]
    assert [image["option_value_id"] for image in data["images"]] == [str(red.id)]


def test_public_product_without_options_has_an_empty_list_and_a_blank_title(api_client):
    variant = ProductVariantFactory(product__is_active=True)
    ProductImageFactory(product=variant.product)

    data = api_client.get(f"/api/v1/public/catalog/products/{variant.product.slug}/").data["data"]

    assert data["options"] == []
    assert data["variants"][0]["title"] == ""
    assert data["variants"][0]["option_value_ids"] == []
    assert data["images"][0]["option_value_id"] is None


# --- import / export ---------------------------------------------------------

HEADER = "product_name,sku,price,cost_price,option1_name,option1_value,option2_name,option2_value\n"


def _import(text: str):
    return import_variants(file=io.BytesIO(text.encode("utf-8")), fmt="csv")


def test_import_creates_options_and_variants_from_the_option_columns():
    product = ProductFactory(name="Import Tee")

    result = _import(
        HEADER
        + "Import Tee,IT-RED-M,100,40,Colour,Red,Size,M\n"
        + "Import Tee,IT-RED-L,100,40,colour,red,Size,L\n"
    )

    assert (result.created, result.updated, result.errors) == (2, 0, [])
    assert sorted(product.variants.values_list("sku", "title")) == [
        ("IT-RED-L", "Red / L"),
        ("IT-RED-M", "Red / M"),
    ]
    assert [(option["name"], len(option["values"])) for option in product_options(product)] == [
        ("Colour", 1),
        ("Size", 2),
    ]


def test_import_takes_legacy_colour_and_size_columns_as_options():
    product = ProductFactory(name="Legacy Tee")

    result = _import(
        "product_name,sku,price,cost_price,color,size\nLegacy Tee,LT-1,100,40,Black,M\n"
    )

    assert result.errors == []
    variant = product.variants.get()
    assert (variant.title, variant.color, variant.size) == ("Black / M", "", "")
    assert [option["name"] for option in product_options(product)] == ["Colour", "Size"]


def test_import_reports_a_broken_rule_as_a_row_error():
    product = _tee()
    ProductFactory(name="Elsewhere")
    sku = product.variants.get(title="Red / S").sku

    result = _import(
        HEADER
        + "Tee,TEE-DUP,100,40,Colour,Red,Size,S\n"
        + "Tee,TEE-HALF,100,40,Colour,Red,,\n"
        + "Tee,TEE-PAIR,100,40,Colour,,,\n"
        + "Tee,TEE-NEW-OPTION,100,40,Colour,Red,Fit,Slim\n"
        + f"Elsewhere,{sku},100,40,,,,\n"
        + "Tee,TEE-GREEN-S,100,40,Colour,Green,Size,S\n"
    )

    assert result.created == 1
    assert [error["sku"] for error in result.errors] == [
        "TEE-DUP",
        "TEE-HALF",
        "TEE-PAIR",
        "TEE-NEW-OPTION",
        sku,
    ]
    assert "already exists" in result.errors[0]["message"]
    assert product.variants.filter(deleted_at__isnull=True).count() == 5
    assert ProductVariant.objects.get(sku=sku).product_id == product.id
    assert not ProductOptionValue.objects.filter(option__product=product, value="Slim").exists()


def test_export_then_import_round_trips_a_product_with_options():
    product = _tee()

    csv_bytes = export_variants(product.variants.all(), fmt="csv")
    product.variants.update(price=Decimal("1.00"))
    result = import_variants(file=io.BytesIO(csv_bytes), fmt="csv")

    assert (result.created, result.updated, result.errors) == (0, 4, [])
    assert set(product.variants.values_list("price", flat=True)) == {Decimal("500.00")}
    assert sorted(product.variants.values_list("title", flat=True)) == [
        "Blue / M",
        "Blue / S",
        "Red / M",
        "Red / S",
    ]


def test_export_writes_legacy_text_into_the_option_columns():
    product = _legacy_product()

    text = export_variants(product.variants.filter(sku="OLD-1"), fmt="csv").decode("utf-8")

    header, row = (line.split(",") for line in text.splitlines()[:2])
    cells = dict(zip(header, row, strict=True))
    assert (cells["option1_name"], cells["option1_value"]) == ("Colour", "Red")
    assert (cells["option2_name"], cells["option2_value"]) == ("Size", "M")


def test_make_variant_helper_matches_the_service_title():
    product = ProductFactory()
    values = make_options(product, {"Colour": ["Red"], "Size": ["M"]})

    assert make_variant(product, [values["M"], values["Red"]]).title == "Red / M"
