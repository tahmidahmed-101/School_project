# Modularity plan — business features

Goal: one codebase runs a corner shop or a full ERP. Whole modules are already
toggleable (Payroll, Procurement, Logistics, Discounts, Coupons, Reports).
This document covers the level below: capabilities *inside* the
core modules that a simple shop does not want.

Deliberately short. Each entry is something a shop owner would recognise by name,
not an engineering axis.

## Verified current state

| Fact | Evidence |
|---|---|
| Module on/off works, enforced server-side | `apps/business/middleware.py:29` |
| Sub-feature flags exist as a mechanism | `ModuleSpec.config_fields`, `constants.py:33` |
| Six flags defined | `bundles`, `multi_warehouse`, `product_variations`, `returns`, `tax`, `constants.py` |
| Flags are enforced server-side | `require_feature`, `services/modules.py` |
| Settings UI renders `config_fields` generically | `ModulesTab.jsx` |

A new feature toggle is one registry line plus one `require_feature` call, and —
where rows would be stranded — one `disable_guard` naming a `() -> str | None`.

## The safety rule

**A toggle hides; it never deletes.** Stock stays per-warehouse in the schema
whether or not warehouse management is on — off simply resolves everything to the
default warehouse. Flipping it back on is lossless.

Where turning a feature off would strand existing rows, the toggle must **refuse**
rather than hide, mirroring the dependency guards already in
`services/modules.py`.

### Corollary: "not modular" still means "hideable"

Some capabilities cannot be removed — the ledger, stock, variants all have hard
FKs into them. They can still be made **invisible**: keep writing the rows, supply
the default silently, and never show the surface. Chart of accounts stays and
keeps balancing the books while the owner sees only a flat category list; stock
rows keep being written to the default warehouse while no warehouse ever appears
in the UI.

So there is no third category. Every feature below is either hidden-with-a-default
or refused-when-in-use. Nothing is out of reach; the hard ones just need a default
supplied underneath before the surface can go.

## The feature set

Seven toggles. Each shows the simple-mode behaviour, which is the point.

| # | Feature | Off means | Difficulty |
|---|---|---|---|
| 1 | **Product variations** | One price, one SKU, one stock number per product. No variants tab. | DONE |
| 2 | **Warehouse management** | One implicit location. No warehouse picker anywhere. | DONE |
| 3 | **Stock management** | No stock tracking at all. Sell without inventory (services, made-to-order, dropship). | **Hard — see below** |
| 4 | **Simple expenses** | Plain expense categories instead of picking a chart-of-accounts ledger account. | DONE |
| 5 | **Product bundles** | No bundle products. | DONE |
| 6 | **Returns / RMA** | No returns workflow. | DONE |
| 7 | **Tax** | No tax rates; tax is always zero. | DONE |

### On #3, stock management

This is the one that is not a simple flag. Inventory is currently
`can_disable=False` (`constants.py`) because order lines and purchase orders are
keyed on a warehouse. Selling without stock tracking means order lines must
tolerate a null warehouse and skip reservation entirely — a schema and
service-layer change, not a toggle.

Recommend doing it **last**, and only if you actually have customers who sell
without stock. Items 1, 2 and 4 cover most of the "simple shop" gap on their own.

### On #4, simple expenses

`Expense.expense_account` is a PROTECT FK to `Account` — the chart of accounts.
There is no `ExpenseCategory` model. Simple mode needs one: a flat named list
("Rent", "Utilities", "Transport") that maps behind the scenes to a default
ledger account, so the books still balance without the owner ever seeing a
chart of accounts.

That makes #4 a genuine feature, not a flag — new model, migration, API, UI.
It is also probably the highest-value item here for a small business.

## Implementation order

**Phase 1 — plumbing (prerequisite). DONE.**
- `is_feature_enabled(module_key, field_key)` — `selectors/modules.py`. Off when
  the module is off, so callers guard one thing. An unregistered field reads as
  on, so a flag missing from the registry cannot silently disable a feature.
- `require_feature(module_key, field_key)` — `services/modules.py`. Raises
  `BusinessRuleViolationError(code="feature_disabled")`.
- First real enforcement: `create_warehouse` refuses a second warehouse when
  `multi_warehouse` is off. The flag previously hid the picker and left the
  endpoint open.
- Frontend: generic `config_fields` rendering + `useModuleConfig` hook.

**Phase 2 — the easy four. DONE.**
- `ConfigField.disable_guard` — a dotted path to `() -> str | None`. A message
  means rows would be stranded, so `set_module_config` refuses with
  `feature_in_use` instead of hiding them. Guards only run on an on→off edge.
- `inventory.multi_warehouse` — `transfer_stock` refuses; guard refuses the
  switch-off while a second warehouse is on file. Warehouses tab, transfer
  button and every warehouse column disappear.
- `catalog.bundles` — `create_bundle` refuses; guard refuses while bundle
  products exist. Bundles tab hidden.
- `orders.returns` — `create_rma` refuses (admin and customer both route
  through it); guard refuses while RMAs exist. Returns tab hidden.
- `accounting.tax` — cart lines compute zero tax and `create_tax_rate` refuses.
  No guard: existing rates are kept, only hidden, so flipping back is lossless.

**Phase 3 — product variations. DONE.**
- `catalog.product_variations`. Off: `create_product` / `update_product` refuse
  `product_type=variant`, `create_variant` refuses a second variant on *any*
  product (the rule stops being product-type-specific), `generate_variants` and
  `create_attribute` refuse, and the importer — which writes rows directly, so
  it inherits nothing — errors that row instead of the whole file.
- Guard refuses the switch-off only while some product carries more than one
  live variant. A product merely *typed* `variant` with one variant is
  grandfathered: nothing is stranded, the type stops being visible, and
  `create_variant` blocks any second one.
- UI: Attributes tab, product Type column and field, and the attribute-values
  column and picker all disappear. The Variants panel becomes "Price & stock"
  with create suppressed, and the product create form collects one SKU and one
  price instead of a repeating variant list.
- Order entry is untouched: with one variant per product, the variant *is* the
  product and the SKU picker already reads correctly.

**Phase 4 — simple expenses. DONE.**
- Named `accounting.chart_of_accounts_picker`, default True, *not*
  `simple_expenses`. Every other flag reads "off = simpler", and an inverted one
  would make `_refuse_if_in_use` — which only fires on an on→off edge — guard the
  wrong direction. Off means simple: expenses are booked against a plain category
  list and the chart of accounts never appears.
- New `ExpenseCategory` (name, description, `expense_account` PROTECT FK).
  `Expense` gains an optional `category` FK; `expense_account` is never nulled,
  because the journal entry is posted against it either way.
- `create_expense` takes both and resolves: picker off refuses a hand-picked
  `expense_account` (`feature_disabled`) and requires a category
  (`expense_category_required`); picker on keeps taking the account directly.
- Guard `uncategorised_expenses_in_use` refuses the switch-off only while some
  expense has no category *and* no category maps to its account. An expense
  booked before categories existed is grandfathered once a category points at
  the same account — nothing would be stranded.
- A category created without an account (simple mode has none to show) falls
  back to a seeded `general_expense` account, code 6900, so the books balance.
- API: `expense-categories/` CRUD + restore. The expense list filter previously
  called `category_id` actually filtered by account; it is now `account_id`, and
  `category_id` filters by real category.
- UI: Accounts tab hidden when the picker is off, an Expense categories tab in
  both modes, and the expense form's account picker swapped for a category
  dropdown. The Journal entries tab is deliberately left visible — the plan's
  corollary hides the *chart of accounts*, not the ledger.

**Phase 5 — stock management off.** Only if genuinely needed.

## Open question

Does the vendor sell these features, or are they the customer's own
configuration? This plan assumes **modules are sold** (`is_licensed`) and
**features are configured** by the operator. If features become sellable,
`ModuleSetting.config` needs a licensed/enabled split like `is_licensed` —
noticeably more machinery.
