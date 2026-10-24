from __future__ import annotations

import pytest

from apps.business.constants import ModuleKey
from apps.business.models import ModuleSetting
from apps.business.selectors.modules import is_module_enabled, module_config, modules_list
from apps.business.services.modules import set_module_config, set_module_enabled
from apps.common.exceptions import BusinessRuleViolationError

pytestmark = pytest.mark.django_db

LIST_ENDPOINT = "/api/v1/admin/settings/modules/"


def _detail(key: str) -> str:
    return f"{LIST_ENDPOINT}{key}/"


def test_every_module_defaults_to_enabled():
    assert all(module["is_enabled"] for module in modules_list())


def test_disabling_an_optional_module_sticks():
    set_module_enabled(key=ModuleKey.REPORTING, is_enabled=False)

    assert is_module_enabled(ModuleKey.REPORTING) is False
    assert ModuleSetting.objects.get(key=ModuleKey.REPORTING).is_enabled is False


def test_a_core_module_cannot_be_disabled():
    with pytest.raises(BusinessRuleViolationError) as exc:
        set_module_enabled(key=ModuleKey.ORDERS, is_enabled=False)
    assert exc.value.code == "module_locked"
    assert is_module_enabled(ModuleKey.ORDERS) is True


def test_unknown_module_is_rejected():
    with pytest.raises(BusinessRuleViolationError) as exc:
        set_module_enabled(key="teleportation", is_enabled=False)
    assert exc.value.code == "unknown_module"


def test_a_locked_module_reports_why():
    orders = next(m for m in modules_list() if m["key"] == ModuleKey.ORDERS)
    assert orders["can_disable"] is False
    assert orders["locked_reason"]


def test_unlisted_keys_are_treated_as_enabled():
    assert is_module_enabled("some.future.module") is True


def test_reenabling_is_blocked_while_a_dependency_is_off():
    set_module_enabled(key=ModuleKey.LOGISTICS, is_enabled=False)
    assert is_module_enabled(ModuleKey.LOGISTICS) is False


def test_disabled_module_reports_its_dependents():
    state = next(m for m in modules_list() if m["key"] == ModuleKey.PROCUREMENT)
    assert ModuleKey.INVENTORY in state["depends_on"]


def test_admin_can_list_modules(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    response = api_client.get(LIST_ENDPOINT)

    assert response.status_code == 200
    keys = {row["key"] for row in response.data["data"]}
    assert ModuleKey.REPORTING in keys
    assert ModuleKey.ORDERS in keys


def test_admin_can_switch_a_module_off_over_the_api(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    response = api_client.patch(_detail(ModuleKey.REPORTING), {"is_enabled": False}, format="json")

    assert response.status_code == 200
    assert response.data["data"]["is_enabled"] is False
    assert is_module_enabled(ModuleKey.REPORTING) is False


def test_api_refuses_to_switch_off_a_core_module(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    response = api_client.patch(_detail(ModuleKey.CATALOG), {"is_enabled": False}, format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "module_locked"


def test_api_404s_on_an_unknown_module(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    response = api_client.patch(_detail("teleportation"), {"is_enabled": False}, format="json")

    assert response.status_code == 404


def test_disabled_module_endpoints_are_refused(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    set_module_enabled(key=ModuleKey.REPORTING, is_enabled=False)

    response = api_client.get("/api/v1/admin/reporting/low-stock/")

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "module_disabled"


def test_an_enabled_module_is_still_reachable(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    assert api_client.get("/api/v1/admin/reporting/low-stock/").status_code == 200


def test_switching_a_module_back_on_restores_access(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    set_module_enabled(key=ModuleKey.REPORTING, is_enabled=False)

    set_module_enabled(key=ModuleKey.REPORTING, is_enabled=True)

    assert api_client.get("/api/v1/admin/reporting/low-stock/").status_code == 200


def test_module_config_defaults_come_from_the_registry():
    orders = next(m for m in modules_list() if m["key"] == ModuleKey.ORDERS)
    fields = {f["key"]: f["value"] for f in orders["config_fields"]}
    assert fields == {"returns": True}


def test_setting_a_config_field_sticks():
    set_module_config(key=ModuleKey.ORDERS, config={"returns": False})

    assert module_config(ModuleKey.ORDERS) == {"returns": False}
    assert ModuleSetting.objects.get(key=ModuleKey.ORDERS).config == {"returns": False}


def test_an_unknown_config_field_is_rejected():
    with pytest.raises(BusinessRuleViolationError) as exc:
        set_module_config(key=ModuleKey.ORDERS, config={"teleportation": True})
    assert exc.value.code == "unknown_module_setting"


def test_a_field_added_to_the_registry_later_reads_as_its_default():
    ModuleSetting.objects.update_or_create(key=ModuleKey.ORDERS, defaults={"config": {}})

    assert module_config(ModuleKey.ORDERS) == {"returns": True}


def test_admin_can_change_a_config_field_over_the_api(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    response = api_client.patch(
        _detail(ModuleKey.ORDERS), {"config": {"returns": False}}, format="json"
    )

    assert response.status_code == 200
    fields = {f["key"]: f["value"] for f in response.data["data"]["config_fields"]}
    assert fields == {"returns": False}


def test_a_config_patch_may_not_also_flip_the_switch(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    response = api_client.patch(
        _detail(ModuleKey.REPORTING),
        {"is_enabled": False, "config": {}},
        format="json",
    )

    assert response.status_code == 400


def test_integration_status_reports_sms_configuration(api_client, admin_user, settings):
    settings.TWILIO_ACCOUNT_SID = "sid"
    settings.TWILIO_AUTH_TOKEN = "token"
    settings.TWILIO_PHONE_NUMBER = "+8801000000000"
    api_client.force_authenticate(user=admin_user)

    response = api_client.get("/api/v1/admin/settings/integrations/")

    assert response.status_code == 200
    assert response.data["data"]["sms"] == {
        "provider": "Twilio",
        "is_configured": True,
        "from_number": "+8801000000000",
    }


def test_integration_status_reports_sms_as_unconfigured(api_client, admin_user, settings):
    settings.TWILIO_ACCOUNT_SID = ""
    settings.TWILIO_AUTH_TOKEN = ""
    api_client.force_authenticate(user=admin_user)

    response = api_client.get("/api/v1/admin/settings/integrations/")

    assert response.data["data"]["sms"]["is_configured"] is False


def _unlicense(key: str) -> None:
    ModuleSetting.objects.update_or_create(key=key, defaults={"is_licensed": False})


def test_an_unlicensed_module_is_absent_from_the_list():
    _unlicense(ModuleKey.REPORTING)

    assert not any(module["key"] == ModuleKey.REPORTING for module in modules_list())


def test_an_unlicensed_module_reads_as_off():
    """Not merely hidden: the middleware and every dependency check ask this."""
    _unlicense(ModuleKey.REPORTING)

    assert is_module_enabled(ModuleKey.REPORTING) is False


def test_an_unlicensed_module_cannot_be_switched_on_by_the_operator():
    _unlicense(ModuleKey.REPORTING)

    with pytest.raises(BusinessRuleViolationError) as exc:
        set_module_enabled(key=ModuleKey.REPORTING, is_enabled=True)
    assert exc.value.code == "module_not_licensed"


def test_an_unlicensed_module_cannot_be_configured_by_the_operator():
    _unlicense(ModuleKey.PROCUREMENT)

    with pytest.raises(BusinessRuleViolationError) as exc:
        set_module_config(key=ModuleKey.PROCUREMENT, config={})
    assert exc.value.code == "module_not_licensed"


def test_licensing_a_module_leaves_the_operator_switch_alone():
    set_module_enabled(key=ModuleKey.REPORTING, is_enabled=False)
    ModuleSetting.objects.filter(key=ModuleKey.REPORTING).update(is_licensed=True)

    assert is_module_enabled(ModuleKey.REPORTING) is False


def test_a_core_module_stays_licensed_even_if_a_row_says_otherwise():
    """can_disable=False modules carry the schema everything points into, so the
    registry overrides a stray row rather than bricking the install."""
    _unlicense(ModuleKey.ORDERS)

    assert is_module_enabled(ModuleKey.ORDERS) is True
    assert any(module["key"] == ModuleKey.ORDERS for module in modules_list())


def test_unlicensed_module_detail_is_a_404_not_a_403(api_client, admin_user):
    _unlicense(ModuleKey.REPORTING)
    api_client.force_authenticate(user=admin_user)

    response = api_client.patch(_detail(ModuleKey.REPORTING), {"is_enabled": True}, format="json")

    assert response.status_code == 404


def test_core_module_licence_is_refused_by_the_admin_form():
    """Guards the changelist checkbox, which bypasses get_readonly_fields."""
    from apps.business.admin import ModuleSettingForm

    setting = ModuleSetting.objects.get(key=ModuleKey.ORDERS)
    form = ModuleSettingForm(
        {"key": setting.key, "is_licensed": False, "is_enabled": True, "config": "{}"},
        instance=setting,
    )

    assert not form.is_valid()
    assert "is_licensed" in form.errors


def test_a_sellable_module_licence_is_accepted_by_the_admin_form():
    from apps.business.admin import ModuleSettingForm

    setting = ModuleSetting.objects.get(key=ModuleKey.REPORTING)
    form = ModuleSettingForm(
        {"key": setting.key, "is_licensed": False, "is_enabled": True, "config": "{}"},
        instance=setting,
    )

    assert form.is_valid(), form.errors
    form.save()
    assert ModuleSetting.objects.get(key=ModuleKey.REPORTING).is_licensed is False


def test_the_bulk_action_skips_core_modules():
    from django.contrib.admin.sites import AdminSite
    from django.test import RequestFactory

    from apps.business.admin import ModuleSettingAdmin

    admin_instance = ModuleSettingAdmin(ModuleSetting, AdminSite())
    request = RequestFactory().post("/admin/")
    request._messages = type("M", (), {"add": lambda *a, **k: None})()

    admin_instance.unlicense_selected(request, ModuleSetting.objects.all())

    assert ModuleSetting.objects.get(key=ModuleKey.ORDERS).is_licensed is True
    assert ModuleSetting.objects.get(key=ModuleKey.REPORTING).is_licensed is False


def test_a_feature_reads_as_on_by_default():
    from apps.business.selectors.modules import is_feature_enabled

    assert is_feature_enabled(ModuleKey.ORDERS, "returns") is True


def test_a_feature_reads_as_off_once_switched_off():
    from apps.business.selectors.modules import is_feature_enabled

    set_module_config(key=ModuleKey.ORDERS, config={"returns": False})

    assert is_feature_enabled(ModuleKey.ORDERS, "returns") is False


def test_a_feature_of_a_disabled_module_is_off():
    """Callers guard one thing, not two."""
    from apps.business.selectors.modules import is_feature_enabled

    set_module_enabled(key=ModuleKey.REPORTING, is_enabled=False)

    assert is_feature_enabled(ModuleKey.REPORTING, "anything") is False


def test_an_unregistered_field_reads_as_on():
    """A flag not yet in the registry must not silently disable a feature."""
    from apps.business.selectors.modules import is_feature_enabled

    assert is_feature_enabled(ModuleKey.ORDERS, "not_a_real_flag") is True


def test_require_feature_raises_when_switched_off():
    from apps.business.services.modules import require_feature

    set_module_config(key=ModuleKey.ORDERS, config={"returns": False})

    with pytest.raises(BusinessRuleViolationError) as exc:
        require_feature(ModuleKey.ORDERS, "returns")
    assert exc.value.code == "feature_disabled"
    assert "Returns / RMA" in str(exc.value)


# --------------------------------------------------------------------------
# Phase 2 feature toggles
# --------------------------------------------------------------------------


def test_tax_off_makes_order_lines_untaxed():
    from decimal import Decimal

    from apps.accounting.services.accounts import create_tax_rate
    from apps.accounts.factories import CustomerUserFactory
    from apps.catalog.factories import ProductVariantFactory
    from apps.inventory.constants import MovementType
    from apps.inventory.services.stock import record_movement
    from apps.orders.services.carts import add_line, get_or_create_cart

    create_tax_rate(name="VAT", rate_percent=Decimal("10.00"))
    variant = ProductVariantFactory(price=Decimal("100.00"))
    record_movement(
        variant=variant,
        movement_type=MovementType.PURCHASE_IN,
        quantity=5,
        unit_cost=Decimal("1.00"),
    )
    set_module_config(key=ModuleKey.ACCOUNTING, config={"tax": False})

    cart = get_or_create_cart(CustomerUserFactory())
    add_line(order=cart, variant=variant, quantity=1)

    assert cart.lines.get().tax_amount == Decimal("0")


def test_tax_off_refuses_a_new_tax_rate():
    from decimal import Decimal

    from apps.accounting.services.accounts import create_tax_rate

    set_module_config(key=ModuleKey.ACCOUNTING, config={"tax": False})

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_tax_rate(name="VAT", rate_percent=Decimal("10.00"))
    assert exc.value.code == "feature_disabled"


def test_tax_off_keeps_existing_rates():
    """A toggle hides; it never deletes."""
    from decimal import Decimal

    from apps.accounting.models import TaxRate
    from apps.accounting.services.accounts import create_tax_rate

    create_tax_rate(name="VAT", rate_percent=Decimal("10.00"))
    set_module_config(key=ModuleKey.ACCOUNTING, config={"tax": False})

    assert TaxRate.objects.count() == 1


def test_bundles_off_refuses_a_new_bundle():
    from decimal import Decimal

    from apps.catalog.factories import CategoryFactory, ProductVariantFactory
    from apps.catalog.services.bundles import create_bundle

    component = ProductVariantFactory(price=Decimal("10.00"))
    set_module_config(key=ModuleKey.CATALOG, config={"bundles": False})

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_bundle(
            category=CategoryFactory(),
            name="Duo",
            sku="BND-OFF",
            price=Decimal("15.00"),
            components=[{"component_variant_id": str(component.id), "quantity": 1}],
        )
    assert exc.value.code == "feature_disabled"


def test_bundles_cannot_be_switched_off_while_one_exists():
    from decimal import Decimal

    from apps.catalog.factories import CategoryFactory, ProductVariantFactory
    from apps.catalog.services.bundles import create_bundle

    component = ProductVariantFactory(price=Decimal("10.00"))
    create_bundle(
        category=CategoryFactory(),
        name="Duo",
        sku="BND-ON",
        price=Decimal("15.00"),
        components=[{"component_variant_id": str(component.id), "quantity": 1}],
    )

    with pytest.raises(BusinessRuleViolationError) as exc:
        set_module_config(key=ModuleKey.CATALOG, config={"bundles": False})
    assert exc.value.code == "feature_in_use"


def test_returns_off_refuses_a_new_rma():
    from apps.orders.factories import SalesOrderFactory, SalesOrderLineFactory
    from apps.orders.services.returns import create_rma

    order = SalesOrderFactory()
    line = SalesOrderLineFactory(order=order)
    set_module_config(key=ModuleKey.ORDERS, config={"returns": False})

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_rma(order=order, lines=[{"order_line": line, "quantity": 1}])
    assert exc.value.code == "feature_disabled"


def test_returns_cannot_be_switched_off_while_an_rma_exists():
    from apps.orders.factories import ReturnRMAFactory

    ReturnRMAFactory()

    with pytest.raises(BusinessRuleViolationError) as exc:
        set_module_config(key=ModuleKey.ORDERS, config={"returns": False})
    assert exc.value.code == "feature_in_use"


# --------------------------------------------------------------------------
# Phase 3 — product variations
# --------------------------------------------------------------------------


def _simple_product(**kwargs):
    from apps.catalog.factories import CategoryFactory
    from apps.catalog.services.products import create_product

    return create_product(category=CategoryFactory(), name=kwargs.pop("name", "Tee"), **kwargs)


def test_variations_off_refuses_a_product_with_options():
    from decimal import Decimal

    set_module_config(key=ModuleKey.CATALOG, config={"product_variations": False})

    with pytest.raises(BusinessRuleViolationError) as exc:
        _simple_product(price=Decimal("10.00"), options=[{"name": "Size", "values": ["S"]}])
    assert exc.value.code == "feature_disabled"


def test_variations_off_refuses_adding_options_to_a_product():
    from apps.catalog.services.options import set_product_options

    product = _simple_product()
    set_module_config(key=ModuleKey.CATALOG, config={"product_variations": False})

    with pytest.raises(BusinessRuleViolationError) as exc:
        set_product_options(product=product, options=[{"name": "Size", "values": [{"value": "S"}]}])
    assert exc.value.code == "feature_disabled"


def test_variations_off_refuses_a_second_variant_on_a_variant_product():
    """The single-variant rule stops being a product-type rule and becomes a
    catalog-wide one."""
    from decimal import Decimal

    from apps.catalog.services.products import create_variant

    product = _simple_product()
    create_variant(product=product, sku="TEE-S", price=Decimal("10.00"))
    set_module_config(key=ModuleKey.CATALOG, config={"product_variations": False})

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_variant(product=product, sku="TEE-M", price=Decimal("10.00"))
    assert exc.value.code == "simple_product_single_variant"


def test_variations_off_still_allows_the_one_variant():
    from decimal import Decimal

    from apps.catalog.services.products import create_variant

    product = _simple_product()
    set_module_config(key=ModuleKey.CATALOG, config={"product_variations": False})

    assert create_variant(product=product, sku="TEE", price=Decimal("10.00")).pk is not None


def test_variations_off_refuses_variant_generation():
    from decimal import Decimal

    from apps.catalog.services.variants import generate_variants

    product = _simple_product()
    set_module_config(key=ModuleKey.CATALOG, config={"product_variations": False})

    with pytest.raises(BusinessRuleViolationError) as exc:
        generate_variants(product=product, price=Decimal("10.00"))
    assert exc.value.code == "feature_disabled"


def test_variations_off_rejects_an_import_row_adding_a_second_sku():
    """The importer goes through the variant service, so it inherits the rule."""
    import io
    from decimal import Decimal

    from apps.catalog.services.products import create_variant
    from apps.catalog.services.variant_import_export import import_variants

    product = _simple_product(name="Mug")
    create_variant(product=product, sku="MUG", price=Decimal("10.00"))
    set_module_config(key=ModuleKey.CATALOG, config={"product_variations": False})

    csv_file = io.BytesIO(b"sku,product_name,price\nMUG-2,Mug,12.00\n")
    result = import_variants(file=csv_file, fmt="csv")

    assert result.created == 0
    assert "Turn product variations on first" in result.errors[0]["message"]


def test_variations_cannot_be_switched_off_while_a_product_has_two():
    from decimal import Decimal

    _simple_product(price=Decimal("10.00"), options=[{"name": "Size", "values": ["S", "M"]}])

    with pytest.raises(BusinessRuleViolationError) as exc:
        set_module_config(key=ModuleKey.CATALOG, config={"product_variations": False})
    assert exc.value.code == "feature_in_use"


def test_variations_can_be_switched_off_when_every_product_has_one():
    from decimal import Decimal

    from apps.business.selectors.modules import is_feature_enabled
    from apps.catalog.services.products import create_variant

    product = _simple_product()
    create_variant(product=product, sku="TEE", price=Decimal("10.00"))

    set_module_config(key=ModuleKey.CATALOG, config={"product_variations": False})

    assert is_feature_enabled(ModuleKey.CATALOG, "product_variations") is False


# --- accounting.chart_of_accounts_picker -------------------------------------
# Off means simple mode: expenses are booked against a flat category list and the
# chart of accounts never appears.


def _expense_category(name="Rent"):
    from apps.accounting.factories import AccountFactory
    from apps.accounting.models import Account
    from apps.accounting.services.expense_categories import create_expense_category

    account = AccountFactory(type=Account.Type.EXPENSE)
    return create_expense_category(name=name, expense_account=account)


def _payment_account():
    from apps.accounting.factories import AccountFactory
    from apps.accounting.models import Account

    return AccountFactory(type=Account.Type.ASSET)


def test_picker_off_refuses_an_expense_that_picks_its_own_account():
    from datetime import date
    from decimal import Decimal

    from apps.accounting.factories import AccountFactory
    from apps.accounting.models import Account
    from apps.accounting.services.expenses import create_expense

    _expense_category()
    set_module_config(key=ModuleKey.ACCOUNTING, config={"chart_of_accounts_picker": False})

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_expense(
            expense_date=date(2026, 1, 1),
            payee="City Power",
            amount=Decimal("10.00"),
            expense_account=AccountFactory(type=Account.Type.EXPENSE),
            payment_account=_payment_account(),
        )
    assert exc.value.code == "feature_disabled"


def test_picker_off_requires_a_category():
    from datetime import date
    from decimal import Decimal

    from apps.accounting.services.expenses import create_expense

    set_module_config(key=ModuleKey.ACCOUNTING, config={"chart_of_accounts_picker": False})

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_expense(
            expense_date=date(2026, 1, 1),
            payee="City Power",
            amount=Decimal("10.00"),
            payment_account=_payment_account(),
        )
    assert exc.value.code == "expense_category_required"


def test_picker_off_still_books_the_category_account_to_the_ledger():
    """The point of simple mode: the owner never sees an account, the ledger
    still gets one."""
    from datetime import date
    from decimal import Decimal

    from apps.accounting.services.expenses import create_expense

    category = _expense_category()
    set_module_config(key=ModuleKey.ACCOUNTING, config={"chart_of_accounts_picker": False})

    expense = create_expense(
        expense_date=date(2026, 1, 1),
        payee="City Power",
        amount=Decimal("10.00"),
        category=category,
        payment_account=_payment_account(),
    )

    assert expense.expense_account_id == category.expense_account_id
    assert expense.journal_entry is not None
    debited = {line.account_id for line in expense.journal_entry.lines.filter(debit__gt=0)}
    assert debited == {category.expense_account_id}


def test_picker_on_still_takes_a_direct_account():
    from datetime import date
    from decimal import Decimal

    from apps.accounting.factories import AccountFactory
    from apps.accounting.models import Account
    from apps.accounting.services.expenses import create_expense

    account = AccountFactory(type=Account.Type.EXPENSE)

    expense = create_expense(
        expense_date=date(2026, 1, 1),
        payee="City Power",
        amount=Decimal("10.00"),
        expense_account=account,
        payment_account=_payment_account(),
    )

    assert expense.expense_account_id == account.id
    assert expense.category_id is None


def test_picker_cannot_be_switched_off_while_an_expense_has_no_matching_category():
    from datetime import date
    from decimal import Decimal

    from apps.accounting.factories import AccountFactory
    from apps.accounting.models import Account
    from apps.accounting.services.expenses import create_expense

    create_expense(
        expense_date=date(2026, 1, 1),
        payee="Bespoke",
        amount=Decimal("10.00"),
        expense_account=AccountFactory(type=Account.Type.EXPENSE),
        payment_account=_payment_account(),
    )

    with pytest.raises(BusinessRuleViolationError) as exc:
        set_module_config(key=ModuleKey.ACCOUNTING, config={"chart_of_accounts_picker": False})
    assert exc.value.code == "feature_in_use"


def test_picker_can_be_switched_off_once_a_category_maps_the_account():
    """An expense booked before categories existed is not stranded as long as a
    category now points at the same account."""
    from datetime import date
    from decimal import Decimal

    from apps.accounting.factories import AccountFactory
    from apps.accounting.models import Account
    from apps.accounting.services.expense_categories import create_expense_category
    from apps.accounting.services.expenses import create_expense
    from apps.business.selectors.modules import is_feature_enabled

    account = AccountFactory(type=Account.Type.EXPENSE)
    create_expense(
        expense_date=date(2026, 1, 1),
        payee="Landlord",
        amount=Decimal("10.00"),
        expense_account=account,
        payment_account=_payment_account(),
    )
    create_expense_category(name="Rent", expense_account=account)

    set_module_config(key=ModuleKey.ACCOUNTING, config={"chart_of_accounts_picker": False})

    assert is_feature_enabled(ModuleKey.ACCOUNTING, "chart_of_accounts_picker") is False


def test_picker_can_be_switched_off_with_no_expenses_at_all():
    from apps.business.selectors.modules import is_feature_enabled

    set_module_config(key=ModuleKey.ACCOUNTING, config={"chart_of_accounts_picker": False})

    assert is_feature_enabled(ModuleKey.ACCOUNTING, "chart_of_accounts_picker") is False


def test_any_staff_member_can_read_the_module_list(api_client, staff_user):
    """The dashboard hides a switched-off module's pages for everyone, so a
    staff member without settings.view still has to know which are off."""
    set_module_enabled(key=ModuleKey.REPORTING, is_enabled=False)
    api_client.force_authenticate(user=staff_user)

    response = api_client.get(LIST_ENDPOINT)

    assert response.status_code == 200
    states = {module["key"]: module["is_enabled"] for module in response.data["data"]}
    assert states[ModuleKey.REPORTING] is False


def test_customer_cannot_read_the_module_list(api_client, customer_user):
    api_client.force_authenticate(user=customer_user)

    assert api_client.get(LIST_ENDPOINT).status_code == 403


def test_staff_member_without_settings_manage_cannot_switch_a_module(api_client, staff_user):
    api_client.force_authenticate(user=staff_user)

    response = api_client.patch(_detail(ModuleKey.REPORTING), {"is_enabled": False}, format="json")

    assert response.status_code == 403
    assert is_module_enabled(ModuleKey.REPORTING)
