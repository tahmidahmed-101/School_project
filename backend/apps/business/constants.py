from __future__ import annotations

from dataclasses import dataclass, field

from django.db import models


class ModuleKey(models.TextChoices):
    CATALOG = "catalog", "Catalog"
    INVENTORY = "inventory", "Inventory"
    ORDERS = "orders", "Orders"
    ACCOUNTING = "accounting", "Accounting"
    AUDIT = "audit", "Audit log"
    PROCUREMENT = "procurement", "Procurement"
    LOGISTICS = "logistics", "Logistics"
    REPORTING = "reporting", "Reports & analytics"
    CMS = "cms", "CMS"


@dataclass(frozen=True)
class ConfigField:
    key: str
    label: str
    description: str
    default: bool
    # Dotted path to `() -> str | None`. A message means the feature is still in
    # use and switching it off would strand rows, so the write is refused.
    disable_guard: str = ""


@dataclass(frozen=True)
class ModuleSpec:
    key: str
    label: str
    description: str
    can_disable: bool
    depends_on: tuple[str, ...] = ()
    permission_codes: tuple[str, ...] = field(default_factory=tuple)
    locked_reason: str = ""
    config_fields: tuple[ConfigField, ...] = field(default_factory=tuple)


# Source of truth. `depends_on` mirrors the hard cross-app FKs, so a module can
# only be switched off while nothing still enabled points into its tables.
MODULE_REGISTRY: tuple[ModuleSpec, ...] = (
    ModuleSpec(
        key=ModuleKey.CATALOG,
        label="Catalog",
        description="Products, variants, categories and bundles.",
        can_disable=False,
        locked_reason="Orders and inventory reference product variants directly.",
        config_fields=(
            ConfigField(
                key="bundles",
                label="Product bundles",
                description=(
                    "Off means products cannot be sold as kits. Existing bundles must be "
                    "removed before it can be switched off."
                ),
                default=True,
                disable_guard="apps.catalog.services.bundles.bundles_in_use",
            ),
            ConfigField(
                key="product_variations",
                label="Product variations",
                description=(
                    "Off means one price, one SKU and one stock number per product. "
                    "Products that already carry several variants must be reduced first."
                ),
                default=True,
                disable_guard="apps.catalog.services.products.product_variations_in_use",
            ),
        ),
    ),
    ModuleSpec(
        key=ModuleKey.INVENTORY,
        label="Inventory",
        description="Stock levels and the stock ledger.",
        can_disable=False,
        depends_on=(ModuleKey.CATALOG,),
        locked_reason="Order lines and purchase orders draw on stock.",
    ),
    ModuleSpec(
        key=ModuleKey.ORDERS,
        label="Orders",
        description="Carts, checkout, fulfillment, returns and payments.",
        can_disable=False,
        depends_on=(ModuleKey.CATALOG, ModuleKey.INVENTORY),
        locked_reason="Selling is the point of the system.",
        config_fields=(
            ConfigField(
                key="returns",
                label="Returns / RMA",
                description=(
                    "Off means customers cannot raise returns. Existing RMAs must be "
                    "cleared before it can be switched off."
                ),
                default=True,
                disable_guard="apps.orders.services.returns.rmas_in_use",
            ),
        ),
    ),
    ModuleSpec(
        key=ModuleKey.ACCOUNTING,
        label="Accounting",
        description="Chart of accounts, journal entries, tax rates and expenses.",
        can_disable=False,
        locked_reason="Orders and procurement both post to the ledger.",
        config_fields=(
            ConfigField(
                key="tax",
                label="Tax",
                description=(
                    "Off means order tax is always zero and no tax rate can be created. "
                    "Existing rates are kept, not deleted."
                ),
                default=True,
            ),
            ConfigField(
                key="chart_of_accounts_picker",
                label="Chart of accounts picker",
                description=(
                    "Off means expenses are booked against a plain category list and the "
                    "chart of accounts is hidden. The ledger still records the account "
                    "each category maps to."
                ),
                default=True,
                disable_guard="apps.accounting.services.expenses.uncategorised_expenses_in_use",
            ),
        ),
    ),
    ModuleSpec(
        key=ModuleKey.AUDIT,
        label="Audit log",
        description="Who changed what, and when.",
        can_disable=False,
        locked_reason="Every module writes to the audit trail.",
    ),
    ModuleSpec(
        key=ModuleKey.PROCUREMENT,
        label="Procurement",
        description="Suppliers, purchase orders, goods receipts and vendor bills.",
        can_disable=True,
        depends_on=(ModuleKey.INVENTORY, ModuleKey.ACCOUNTING),
        permission_codes=("purchasing.view", "purchasing.manage"),
    ),
    ModuleSpec(
        key=ModuleKey.LOGISTICS,
        label="Logistics",
        description="Carriers, courier integrations, shipping zones and rates.",
        can_disable=True,
        depends_on=(ModuleKey.ORDERS,),
        permission_codes=("shipments.view", "shipments.update"),
    ),
    ModuleSpec(
        key=ModuleKey.REPORTING,
        label="Reports & analytics",
        description="Dashboards and exports. Reads everything, owns nothing.",
        can_disable=True,
        permission_codes=("reports.view",),
    ),
    ModuleSpec(
        key=ModuleKey.CMS,
        label="CMS",
        description="Pages, blog posts, banners, content blocks, menus and forms.",
        can_disable=True,
        permission_codes=("cms.view", "cms.manage"),
    ),
)

MODULES_BY_KEY: dict[str, ModuleSpec] = {spec.key: spec for spec in MODULE_REGISTRY}


def config_defaults(key: str) -> dict[str, bool]:
    spec = MODULES_BY_KEY.get(key)
    return {} if spec is None else {f.key: f.default for f in spec.config_fields}


def config_field(key: str, field_key: str) -> ConfigField | None:
    spec = MODULES_BY_KEY.get(key)
    if spec is None:
        return None
    return next((f for f in spec.config_fields if f.key == field_key), None)


def dependents_of(key: str) -> tuple[str, ...]:
    return tuple(spec.key for spec in MODULE_REGISTRY if key in spec.depends_on)
