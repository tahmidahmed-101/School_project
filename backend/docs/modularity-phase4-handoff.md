# Handoff — modularity Phases 4 & 5

Paste this as the first message of a fresh session. Phases 1–3 are done and on disk.

---

Implement Phase 4 (then 5 if I say so) from `backend/docs/modularity-plan.md`.

Repo: `/home/arif/projects/simple/Vantage_Deshboard`. Backend `backend/`, frontend `frontend/`.

## Don't re-explore. Established facts:

**Pattern (Phases 1–3, all done — copy it exactly):**
- Registry: `apps/business/constants.py` → `ModuleSpec.config_fields` = tuple of
  `ConfigField(key, label, description, default, disable_guard="")`.
  `disable_guard` is a dotted path to `() -> str | None`; a returned message means
  rows would be stranded.
- `is_feature_enabled(module_key, field_key)` — `apps/business/selectors/modules.py`.
  Off when the module is off. Unknown field reads as on.
- `require_feature(module_key, field_key)` — `apps/business/services/modules.py`.
  Raises `BusinessRuleViolationError(code="feature_disabled")`.
- `_refuse_if_in_use()` in `services/modules.py` runs `disable_guard` on the on→off
  edge only, raising `code="feature_in_use"`.
- Guard functions live in the OWNING app's service module (e.g.
  `apps.catalog.services.products.product_variations_in_use`), imported lazily by
  `import_string` — never import app services into `apps.business`.
- Frontend: `useModuleConfig(moduleKey, fieldKey)` from `@/hooks/useModuleConfig`.
  Absent → `true`. `ModulesTab.jsx` renders `config_fields` generically already.

**Existing flags:** `catalog.bundles`, `catalog.product_variations`,
`inventory.multi_warehouse`, `orders.returns`, `accounting.tax`.

**Test file:** all feature-toggle backend tests live in
`apps/business/tests/test_modules.py` (append a section, imports inside the test fn).
Frontend tab-hiding tests: `frontend/src/views/featureTabs.test.jsx`.

**Commands:**
- backend: `cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider --no-cov`
- backend lint: `.venv/bin/python -m ruff check apps/ api/` + `ruff format` on changed files only
- frontend: `cd frontend && npm run lint && npx vitest run && npx vite build`
- `python` is not on PATH; use `python3` / `.venv/bin/python`.
- Baseline before you start: 1522 backend tests, 144 frontend tests, all green.

**Prettier caution:** run `npx prettier --write` ONLY on files that were already
prettier-clean (check with `git stash` + `--check` first).
`frontend/src/views/inventory/InventoryView.jsx` is NOT clean — never format it.

## Phase 4 — simple expenses (`accounting.simple_expenses`)

The real work, not a flag. Facts already verified:
- `apps/accounting/models/expense.py` — `Expense.expense_account` is a **PROTECT FK
  to `Account`** (chart of accounts). No `ExpenseCategory` model exists.
- Services: `apps/accounting/services/expenses.py`. Selectors:
  `selectors/expenses.py`. API: `api/v1/admin/accounting/{views,serializers,urls}.py`
  (expenses tab lives in `frontend/src/views/accounting/AccountingView.jsx`,
  `<TabsContent value="expenses">`).
- `ACCOUNT_PROTECTED_RELATIONS` in `services/accounts.py` already lists `expenses`.

Build:
1. `ExpenseCategory` model — flat named list ("Rent", "Utilities", "Transport"),
   each mapping to a default ledger `Account` behind the scenes so the books still
   balance. Migration + factory + admin.
2. `Expense` gets an optional `category` FK. Simple mode writes `category` and
   resolves `expense_account` from it silently; full mode keeps picking the account
   directly. Never null out `expense_account` — the ledger needs it.
3. Flag `accounting.simple_expenses` (note: inverted sense vs. the others — ON means
   *simplified*. Consider naming it `chart_of_accounts_picker` with default True so
   "off = simple" matches every other flag. Pick one, say which, be consistent).
4. Guard: whichever direction strands rows. Expenses booked with a bespoke account
   that no category maps to are the risk.
5. API + UI: category CRUD; expense form shows a category dropdown instead of the
   account picker; Accounts tab already hidden? No — check whether the plan wants the
   whole chart of accounts hidden in simple mode (plan §"Corollary" says yes: keep
   writing rows, show a flat category list).
6. Tests both sides.

## Phase 5 — stock management off

Only if I explicitly ask. Plan says do it last and only for real customers who sell
without stock. `inventory` is `can_disable=False`; order lines and POs are keyed on a
warehouse, so this is a schema + service change (nullable warehouse, skip reservation),
not a toggle.

## Working style

- Go fast. Don't re-read files I've listed above; grep only what's genuinely new.
- Delegate wide file-reading to subagents; keep the conclusion, not the dumps.
- Update `backend/docs/modularity-plan.md` (mark the phase DONE with a short
  what-and-why block, same shape as Phases 2 and 3) when finished.
- Report honestly: test counts, anything skipped, anything pre-existing you touched.
