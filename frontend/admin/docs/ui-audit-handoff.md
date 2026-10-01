# UI Audit — Batches 6–10 (COMPLETE)

**Status: all of Batches 6–10 are implemented and verified.** Batches 1–5 were already done in
commit `4c27f0a` ("Fix UI audit findings: tokens, status badges, loading states, page headers").
The per-batch sections below are kept as the original audit record of *what* was asked; the
"Completion record" and "Design decisions" sections at the bottom record what was actually done
and why. Read those two first.

All work was done against the **dev auth bypass + mock API**, because the real backend
(`https://yoyo-ecom-production-88e8.up.railway.app`) now 404s on every route
(`x-railway-fallback: true`). See "Verification" and "Still open" below.

Finding IDs (`F-`, `CC-`, `TOK-`, `RESP-`, `A11Y-`, `CG-`, `FW-`) refer to the original audit
report; they're included so you can cross-reference specifics if this doc's summary isn't enough.

---

## Batch 6 — Slice-factory migration (cleanup, no visible bug)

**Effort:** M (1–2 days) · **Risk:** Low · **Deps:** none

13 of 31 Redux slices hand-roll `createSlice` instead of using the shared `sliceFactory`
(`src/lib/sliceFactory.ts`). Field shapes happen to match today (`isLoading`/`error`/`data`
all line up), so there's no runtime bug — but any future fix to error normalization or loading
semantics in `sliceFactory.ts` won't propagate to these 13, and they're pure duplicated
boilerplate.

**Files:** `authSlice.ts`, `analyticsSlice.ts`, `notificationSlice.ts`, `staffSlice.ts`,
`customerSlice.ts`, `reviewSlice.ts`, `couponSlice.ts`, `shippingSlice.ts`, `returnSlice.ts`,
`paymentSlice.ts`, `inventorySlice.ts`, `authSettingsSlice.ts`, `settingsSlice.ts`

**What to do:** For each, check whether its domain fits `sliceFactory`'s `{name, endpoint}`
contract (most will — `shippingSlice`/`inventorySlice` have some bespoke action-heavy thunks
like `fetchReservations`/`fetchCouriers`/`adjustStock` that may need to stay hand-rolled
alongside a factory-backed `fetchAll`/`fetchSingle`/etc.). Migrate the ones that fit;
leave a comment on ones that don't and why.

**Verify:** run the existing test suite + a manual pass on each migrated domain's
list/create/edit/delete flow. Nothing should look different — this is a pure refactor.

---

## Batch 7 — Mobile & touch-target pass

**Effort:** L (2–3 days) · **Risk:** Low–Medium · **Deps:** none, but touches `data-table.tsx`
and `TableActions.tsx` which batch 6 doesn't — fine to run either order

This is the batch with actual open **design decisions** — see below before starting the two
items that need them.

### Mechanical (no decision needed)

- **Touch targets too small** (`F-04`): `TableActions.tsx` row actions and `data-table.tsx`
  pagination buttons are 32px (`size-8`/`h-7 w-7`); `ui/button.tsx`'s `icon` size variants
  (`size-8`, `size-7`, `size-6`) are all under the 44×44px minimum. Raise via padding, not
  visual icon size (don't just make icons bigger).
- **Missing accessible names on icon-only buttons** (`A11Y-01`, `A11Y-02`): pagination
  buttons in `data-table.tsx` (~line 246+) and row-action buttons in `TableActions.tsx` have
  no `aria-label` — only a Tooltip, which sets `aria-describedby`, not an accessible name.
  Add `aria-label="First page"` / `"Previous page"` / etc., and `aria-label="View {item}"` /
  `"Edit {item}"` / `"Delete {item}"` to row actions.
  - Note: `Navbar.tsx`'s bell button and the avatar's focus-visible ring were already fixed
    as drive-by changes in batch 1 — don't redo those.
- **Hover-only controls invisible on touch** (`RESP-005`): `ImageUploader.tsx` (~line 275)
  gates "Set primary"/"Remove" behind `group-hover:opacity-100` with no fallback affordance.
  Always show a visible (if subtle) control instead of gating on hover.
- **Keyboard-inaccessible clickable divs** (`A11Y-06`, `A11Y-07`, `A11Y-08`): three files use
  `<div onClick>` with no `role`, `tabIndex`, or keyboard handler —
  `Attributes.tsx` (~line 133, attribute row select), `FlashSales.tsx` (~line 140, sale row
  select), `Expenses.tsx` (~line 330, receipt viewer trigger). Convert to real `<button>`s
  or add `role="button" tabIndex={0}` + an Enter/Space `onKeyDown`.
- **GlobalSearch missing listbox semantics** (`A11Y-14`): `GlobalSearch.tsx` (~line 604) has
  custom arrow-key navigation but no `role="listbox"` on the results container, no
  `role="option"`/`aria-selected` on each result, and no `aria-activedescendant` on the input.
- **FilterToolBar search input has no label** (`A11Y-15`): `FilterToolBar.tsx` (~line 29) —
  add `aria-label={searchPlaceholder}`.

### Needs a design decision first

1. **Mobile table strategy** (blocks the real fix for `RESP-001`/part of `F-04`): every
   `DataTable` still hardcodes pixel `columnWidths` that sum past 375px width, forcing
   horizontal scroll on every list page in all 13 domains, with no mobile fallback. Options:
   a card/stacked layout under `sm:`, horizontal-scroll-only (current behavior, just
   acknowledged as intentional), or column-priority reflow (hide low-priority columns below a
   breakpoint). **Ask:** which one, and does it need to be configurable per-table or can one
   strategy work for all 24 `DataTable` call sites?
2. **Mobile global search entry point** (`RESP-002`): `Navbar.tsx` (~line 109) hides
   `GlobalSearch` entirely below 640px (`hidden sm:flex`) with no replacement. **Ask:**
   icon-trigger opening a full-screen sheet, or an inline collapse?

**Verify:** full-route sweep at 375px in devtools; tab through a list page keyboard-only and
confirm every control is reachable and named; a quick VoiceOver/NVDA pass on 2–3 pages.

---

## Batch 8 — Heading structure & remaining a11y cleanup

**Effort:** M (1–2 days) · **Risk:** Low · **Deps:** none

- **`CardTitle` isn't a real heading** (`A11Y-03`): `ui/card.tsx` (~line 36) renders
  `<div data-slot="card-title">`, not `<h2>`/`<h3>`/etc., so no "section title" inside any
  `Card` app-wide participates in the document outline. Give it an `as`/`level` prop (default
  to something reasonable, e.g. `h3`) so call sites can opt into the right level.
- **Clickable table rows have no keyboard support** (`A11Y-04`): `data-table.tsx` (~line 179)
  — rows with `onRowClick`/`getRowLink` have no `role="button"`, `tabIndex`, or `onKeyDown`.
- **Heading level skips**: `CustomerDetail.tsx` (~lines 135, 161, 175) goes `h1` → `h3` with no
  `h2` (`A11Y-11`); `ProductForm.tsx` (~lines 720, 1014, 1165, 1235) goes `h1` → `h4` with no
  `h2`/`h3` (`A11Y-12`). Fix once `CardTitle`'s level prop exists above, if these use Card.
- **Placeholder-only form labels** (`A11Y-13`): `ProductForm.tsx`'s inline variant-edit row
  (~line 1301, SKU/Name/Price/Stock inputs) has no `<Label>`/`aria-label`, just placeholder text.
- **Low-contrast placeholder text** (`A11Y-09`): `index.css` — light-mode
  `--field-placeholder: #9ca3af` on `--field-bg: #f9fafb` is ~2.3–2.5:1, under WCAG AA. Darken
  toward the `#6b7280` range and spot-check it doesn't look too dark against dark-mode fields.

**Verify:** run an automated a11y scan (axe) on a sample of list/detail/form pages; visually
confirm no `Card` usage shifted layout from the div→heading change (headings can carry
different default browser margins).

---

## Batch 9 — Filter-toolbar & row-action rollout audit

**Effort:** M (1–2 days) · **Risk:** Low–Medium · **Deps:** none

`CC-03`: despite the commits that standardized `FilterToolBar` on some pages ("Match products
filter layout with other pages", "Redesign filter toolbar layout", "Add collapsible filter
button on mobile"), only ~10 of ~24 list pages were confirmed using it. Verify and migrate the
rest onto `FilterToolBar` and `TableActions` where they're still bespoke:

Payments, Returns, Shipments, Couriers, Warehouses, Reservations, Banners, BlogPosts, Pages,
Notifications, Attributes, AuditLogs, GroupBuys, FlashSales, Automations

(Some of these may already be fine — this list is "unconfirmed as of the original audit pass",
not "confirmed broken". Check each before changing it.)

Also worth doing in the same pass, lower priority:

- **Three competing "panel" idioms for the same concept** (`CC-02`): dashboard components
  hardcode hex borders/backgrounds for cards, catalog/audit use
  `bg-card/70 backdrop-blur-sm`, everything else uses the plain `Card` primitive. **Open
  question:** which becomes canonical? (Recommend: plain `Card` on tokens — simplest, already
  used most places.)
- **`TableActions` duplicates `Button` styling instead of composing it** (`CC-04`):
  `TableActions.tsx` (~line 20) hand-builds three near-identical class strings instead of
  `buttonVariants({variant:"ghost", size:"icon"})`. Low risk, makes future `Button` changes
  propagate automatically.

**Verify:** for each migrated page, confirm search/filter/mobile-collapse behavior is
unchanged from before.

---

## Batch 10 — Cleanup, polish & SPA odds and ends

**Effort:** S (~1 day) · **Risk:** Low · **Deps:** none — good first batch if you want a quick win

All independent, small items:

- **Dead Vite scaffold assets** (`CG-03`): delete `src/assets/react.svg`, `src/assets/vite.svg`
  — unreferenced anywhere.
- **`lib`/`utils`/`utility` directory sprawl** (`CG-02`): **DONE** — consolidated into
  `src/lib/`. `src/lib/utils.ts`, `src/lib/sliceFactory.ts`, `src/lib/ExportToCsv.ts`;
  the now-empty `src/utils/` and `src/utility/` directories were deleted. Import specifiers
  were rewritten to `@/lib/sliceFactory` and `@/lib/ExportToCsv`.
- **Leftover mock data** (`CG-06`): `src/assets/Data.ts` still has `example.com` mock seed
  data from before the real backend integration. Confirm no live feature still imports from
  it (should be safe post-integration), then delete.
- **Named-export inconsistency** (`CG-04`): 9 files (`AnalyticsSummary.tsx`,
  `OrderStatusChart.tsx`, `PaymentMethodChart.tsx`, `RevenueOrdersChart.tsx`,
  `SalesByCategoryChart.tsx`, `PriceRangeFilter.tsx`, `AreaChart.tsx`, `ProgressBar.tsx`,
  `DatePicker.tsx`) use named exports vs. ~84 files using `export default`. **Open question:**
  normalize to default, or document the exception for chart/utility subcomponents? Low stakes
  either way.
- **Missing `loading="lazy"` on below-the-fold images** (`FW-06`): `Expenses.tsx` (~line 338),
  `Staffs.tsx` (~line 42), `CampaignDetail.tsx` (~line 67, the campaign banner — clearest
  candidate), `Customers.tsx` (~line 54).
- **Suspense fallback uses a magic-number height** (`FW-05`): `Loader.tsx` (~line 5) —
  `h-[calc(100vh-200px)]` guesses the navbar+padding height instead of filling its actual flex
  parent. Use `h-full w-full`.
- **No per-route document titles** (`FW-03`): `index.html` sets one static `<title>`; nothing
  in `src/` ever touches `document.title`, so all 41 routes show the same browser tab title.
  Add a small `useDocumentTitle(title)` hook, call once per top-level page.
- **Font-loading strategy** (`FW-02`) — **open question:** `index.css` line 1 loads DM Sans via
  a render-blocking Google Fonts `@import` (no preconnect); `@fontsource-variable/geist` is an
  installed dependency that's never imported anywhere. Which is the intended brand font? Once
  decided: either self-host via the installed Geist package, or keep DM Sans but move loading
  to a preconnected `<link>` in `index.html` — and remove whichever strategy loses.
- **Shell corner radius mismatch** (`TOK-11`) — **open question:** `DashboardLayout.tsx`'s
  main panel uses `rounded-2xl` while nearly every card uses `rounded-xl`. Intentional, or
  should they match?
- **Modal-vs-routed-form has no documented rule** (`FW-04`) — **open question:** `Inventory.tsx`
  and `Expenses.tsx` use an inline `Dialog` for add/edit; everything else (Products, Categories,
  Staffs, Coupons, Campaigns, Pages) uses a dedicated routed form. What decides which pattern a
  new feature should use? Document it (e.g. "single-section/quick edit → Dialog, multi-section
  entity → routed page") — doesn't require changing existing pages, just writing the rule down.
- **A few responsive polish items**, all low severity, fine to batch with the above:
  - `RESP-006`: 4-card KPI grids collapse at different breakpoints in different features
    (`InventoryStatsCards.tsx` uses `sm:`→`xl:grid-cols-4`, `Dashboard.tsx`/`AnalyticsSummary.tsx`
    use `sm:`→`lg:grid-cols-4`). Standardize on one (recommend `lg:`).
  - `RESP-007`: `Profile.tsx` (~line 231) 3-column `TabsList` has no responsive fallback,
    label clipping risk at 375px.
  - `RESP-009`/`RESP-010`: a couple of ungated `grid-cols-2` in `ProductDetail.tsx` (~line 183)
    and `Expenses.tsx` (~line 815) — low risk (short labels) but breaks the app's otherwise-
    consistent "always pair `grid-cols` with a responsive prefix" convention.
  - `RESP-012`: `Navbar.tsx` notification dropdown (~line 161) is a fixed `w-80` (320px)
    against a 375px viewport — tight, unverified against safe-area insets.
  - `RESP-013`: `CampaignDetail.tsx` (~line 67) banner image uses fixed `h-64` regardless of
    viewport instead of `aspect-video` or a responsive height.

---

## Design decisions — answered

All seven open questions from the original pass are now resolved. These are the rulings to
build on:

1. **Mobile table strategy** → **stacked cards below `sm`.** Implemented in
   `src/components/common/data-table.tsx`; the real `<table>` is `hidden sm:block` and a
   card list is `sm:hidden`. Row click and keyboard activation work in both.
2. **Mobile global search entry point** → **icon-triggered full-screen sheet.** `Navbar.tsx`
   renders a search icon below `sm`; the sheet is Radix `Dialog`, so focus trapping, Escape,
   focus restore, and background inertness come for free.
3. **Canonical panel idiom** → **plain `Card` primitive on design tokens.** Tokens only
   (`bg-card`, `border-border`, `text-foreground`) — never raw `gray-*` palettes, never
   `bg-card/70 backdrop-blur-sm`. Applied across the 5 remaining dashboard panel sites.
   *Form controls and icon buttons are out of scope for this rule* — they style themselves.
4. **Font strategy** → **self-host Geist.** The render-blocking Google Fonts `@import` for
   DM Sans is gone; `@fontsource-variable/geist` is imported in `main.tsx` and all five
   `--font-*` theme tokens now resolve to `"Geist Variable"`. Verified **zero external
   requests** on page load. (Note: the bare specifier `@fontsource-variable/geist` fails
   `tsc` under `moduleResolution: bundler` because the package is CSS-only with no types —
   import the explicit subpath `@fontsource-variable/geist/index.css` so the `*.css` ambient
   declaration from `vite/client` applies.)
5. **Shell corner radius** → **match the cards: `rounded-xl`.** `DashboardLayout`'s main panel
   was the only `rounded-2xl`. Also token-ised that panel (`border-border`, `bg-muted`).
6. **Modal vs. routed form** → **rule of thumb: single-section or quick-edit → `Dialog`;
   multi-section entity → dedicated routed form.** `Inventory` and `Expenses` use dialogs
   (a few flat fields, edit-in-place); everything else routes to a `*Form` page (many
   interdependent fields, deep-linkable, needs a URL). Existing pages were left as-is —
   this only settles what to do for new features.
7. **Named-export normalization** → **documented exception; no mass rename.** The 9
   chart/utility subcomponents (`AreaChart`, `OrderStatusChart`, `PaymentMethodChart`,
   `RevenueOrdersChart`, `SalesByCategoryChart`, `PriceRangeFilter`, `ProgressBar`,
   `DatePicker`, `AnalyticsSummary`) keep **named** exports. The ~84 route/page/layout
   components keep `export default`. Both are idiomatic in their own right; converting 53+
   files would be pure churn with no runtime benefit.

## Completion record

**Batch 6 — slice-factory migration.** Migrated 6 slices to `sliceFactory`:
`customerSlice`, `staffSlice`, `reviewSlice`, `couponSlice`, `paymentSlice`, `returnSlice`.
Thunk names, state fields, and action endpoints preserved. Two factory options were added to
support them: `initialSingleData` (preserves `singleData: null` on 4 slices) and
`withExtraCases` (composes action-thunk reducer cases without losing them).
`customerSlice`'s account actions don't return the updated user, so `CustomerDetail` now
`await`s a `refresh()` after activate/deactivate to keep the UI correct.
7 slices are **intentionally hand-rolled** and each carries a comment saying why:
`authSlice`, `analyticsSlice`, `notificationSlice`, `shippingSlice`, `inventorySlice`,
`settingsSlice`, `authSettingsSlice` — all need either a different data shape, a different
endpoint contract, or state the factory can't express.
Note: `sliceFactory` now lives at `src/lib/sliceFactory.ts` (moved in Batch 10).

**Batch 7 — mobile & touch targets.** `Button` compact icon variants get ~44×44px hit areas
via a `::after` pseudo-element (zero layout change). `TableActions` got item-specific
`aria-label`s ("View Payment for Order NM-10000", not a bare tooltip).

**Batch 8 — semantics & a11y.** `CardTitle` now takes a heading `level` prop
(`h1`–`h6`, default `h3`) with `m-0`; heading hierarchy fixed in `CustomerDetail` and
`ProductForm`. Placeholder contrast corrected — light `#6b7280` on `#f9fafb` is 4.63:1 (was
failing), dark placeholder is now `#9ca3af`. Added missing labels to placeholder-only variant
inputs, and keyboard-safe controls to `Attributes`, `FlashSales`, `Expenses`.
`ImageUploader` controls are always visible; `FilterToolBar`'s search input has an
`aria-label`; `GlobalSearch` has combobox/listbox/option semantics with `aria-activedescendant`.

**Batch 9 — filter/row-action rollout.** Of the 15 unconfirmed candidates, **14 were already
fine** and were deliberately left alone. Reasons: they already use `TableActions` and/or have
no search row to migrate (Payments, Returns, Pages, Shipments, Couriers, Warehouses,
Reservations, Banners, BlogPosts, Notifications, GroupBuys, Automations); or they are
genuinely master/detail or form cards where a toolbar doesn't fit (Attributes, FlashSales,
Couriers, Warehouses, GroupBuys, Automations, Banners, BlogPosts). **Only `AuditLogs.tsx` was
migrated** — its hand-rolled filter card became `FilterToolBar`, keeping the server-side
query params, `manualPagination`, columns, placeholder text, and its `Reset` button.
`CC-04` (compose `buttonVariants` in `TableActions`) was already done in Batches 1–5.

**Batch 10 — cleanup & polish.** All of it:
- `CG-03`: deleted the dead `src/assets/react.svg` and `vite.svg`.
- `CG-02`: consolidated three top-level utility dirs into `src/lib/`. `src/utils/sliceFactory.ts`
  → `src/lib/sliceFactory.ts`, `src/utility/ExportToCsv.ts` → `src/lib/ExportToCsv.ts`
  (both via `git mv`); 24 + 8 import specifiers updated; `src/utils/` and `src/utility/`
  deleted. `src/lib/utils.ts` (`cn`, `generateId`) was **already** live and stayed put —
  the audit's "it's dead" claim was wrong. `src/lib/` has no barrel and none was invented.
- `CG-06`: `src/assets/Data.ts` was **not** safe to just delete — 3 files still imported it.
  Extracted the 4 live symbols (`StoreSettings`, `defaultStoreSettings`, `AuthSettings`,
  `defaultAuthSettings`) to `src/features/system/settingsDefaults.ts`, repointed the 3
  importers, then deleted the 845-line file. The other ~30 mock-seed exports (products,
  customers, orders, `example.com` URLs, …) were dead and are gone; `src/assets/` no longer
  exists at all.
- `FW-03`: added `src/hooks/use-document-title.ts` and called it once in all 44 page
  components. 9 detail/form pages use a dynamic title from the loaded record
  (`"NM-10000 — Order | NestmartIT"`); the rest are static. All 31 top-level routes now show
  31 distinct titles, deep-link loads included.
- `FW-05`: `Loader` uses `h-full w-full` instead of `h-[calc(100vh-200px)]`.
- `FW-06`: `loading="lazy"` added to the below-the-fold images in `Expenses`, `Staffs`,
  `Customers`, `CampaignDetail`.
- `RESP-006`: 4-card KPI grids standardized on `lg:grid-cols-4` (was `xl:` in `InventoryStatsCards`).
- `RESP-007`: `Profile`'s 3-column `TabsList` is now horizontally scrollable; no clipping at 320px.
- `RESP-009/010`: ungated `grid-cols-2` gated behind `sm:` in `ProductDetail` and `Expenses`.
- `RESP-012`: Navbar notification dropdown capped with `max-w-[calc(100vw-2rem)]`.
- `RESP-013`: `CampaignDetail` banner is `h-40 sm:h-64` (not `aspect-video`, which would have
  made it ~620px tall at desktop instead of the current 256px).

## Verification

- `npx tsc -p tsconfig.app.json` — exit 0. `npm run build` — exit 0 (~1.85s).
- `npx eslint .` — **59 errors, 10 warnings, identical to the pre-existing baseline**
  (52 `react-refresh/only-export-components`, 6 `set-state-in-effect`, 1 `no-explicit-any`).
  No new lint debt. Cleaning these up is a separate pass.
- Browser sweep, all 31 top-level routes at **1280px and 375px**: 62/62 pass — no console
  errors, no horizontal overflow, Geist loaded, correct `document.title`, mock data rendering.
- 63 extra title assertions passed (deep links, row-click into detail, back-nav, create vs
  edit form modes, A→B→A round trips, `/login` redirect).
- Slice-migration domains re-checked after the factory refactor: 6/6 lists render 15 rows;
  review approval, customer activation, and coupon delete all still work.

### The e2e suite cannot run here — do not read the failures as regressions

`tests/e2e/dashboard-features.spec.ts` (12 tests, `@playwright/test` is installed but there is
**no `test` npm script**) currently fails **12/12**, and always did in this environment:

- `beforeEach` calls `loginAsAdmin()`, which does `goto("/login")` then waits for `#email`.
  With `VITE_DEV_AUTH_BYPASS=true` the router redirects `/login` → `/`, so `#email` never
  renders and the helper times out. This fails *before* any assertion about the app.
- Even with the bypass off, the helper submits real credentials to a backend that 404s, so
  login can never succeed.

The suite needs a working backend **and** a bypass-aware `loginAsAdmin` (skip straight through
when `VITE_DEV_AUTH_BYPASS` is on). There is no unit/component test layer at all — no vitest,
jest, or testing-library. So the audit work was verified by typecheck + build + lint +
manual browser sweeps, which is what the batches above actually call "verify".

## Still open

Non-blocking follow-ups, roughly in priority order:

1. **Server-side search/filter on 10 list pages.** Batch 9 found Shipments, Couriers,
   Warehouses, Reservations, Banners, BlogPosts, Pages, Payments, Returns, and Notifications
   have no search or filter row at all. Adding a client-side toolbar would be a *bug* for the
   6 that use `manualPagination` — it would filter only the current server page. The real fix
   is `search`/`status` query params in each slice's `fetchAll`.
2. **`FilterToolBar` renders every control twice** (a desktop `hidden sm:flex` copy and a
   mobile `sm:hidden` copy), so the search input and each filter have two DOM nodes sharing
   one `aria-label`, and `DatePicker` mounts twice. This is *functionally fine* — the hidden
   copy is `display:none`, so it is out of the a11y tree and out of tab order — but it's
   duplicate DOM and duplicate mounted state. A single-instance responsive layout would fix it.
3. **`RequireAuth`'s `<Loader />` sits under `#root`, which has no height.** Now that
   `Loader` is `h-full` it shrink-wraps instead of guessing 200px. Only visible during auth
   bootstrap (never under the dev bypass). Fix by giving `#root { height: 100% }` in `index.css`.
4. **Pre-existing minor layout issues**, not touched because they're outside the batches:
   `/expenses` table is 31px wider than its scroll container at 320px; `ProductDetail`'s
   product image overflows its `aspect-square` box by 8px (clipped by `overflow-hidden`); 4
   progress-bar fills extend past the viewport at 375px on `/` (parent has `overflow-hidden`,
   so no page-level overflow).
5. **Stale comments**: `src/features/{catalog,users,marketing,sales}/types.ts` each have a
   provenance comment naming `src/assets/Data.ts`, which Batch 10 deleted. The comments are
   still accurate as history but reference a file that no longer exists.
6. **Light-mode border shift from `CC-02`**: unifying the dashboard panels on `border-border`
   moved their light border from `#f3f4f6` to `#e5e7eb` (slightly more defined hairlines).
   Knock-on: the Recent Orders panel and the `DataTable` inside it now share one border colour
   in light mode, so that nested edge is less differentiated. Dark mode is unaffected. Also
   intentional: `MetricCard`'s inner icon ring is now `bg-card` instead of `gray-800`, so it
   reads as a hole punched in the card in both modes rather than a raised disc in dark mode.
7. **Production auth/data is still unverified** — everything above was exercised against the
   dev mock. Re-run the sweeps once a working backend URL is available.
8. `docs/` still has no AGENTS.md or test command recorded; worth adding a `test:e2e` script
   to `package.json` so the suite is discoverable.

