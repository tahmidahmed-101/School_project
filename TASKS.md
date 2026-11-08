# UI / performance clean-up (from the 2026-10-08 audit)

## Phase A: quick wins
- [x] Long-lived cache headers for hashed assets (storefront `/_next/static/*`, admin `/assets/*`)
- [x] `tel:` links use `phoneTel`
- [x] CSP allows the Cloudflare Insights beacon
- [x] Category links no longer prefetch a full `/shop` render each
- [x] Admin: field colour tokens registered; hand-written field backgrounds removed
- [x] Admin: dead print stylesheet removed
- [x] Admin: notification bell refreshes every 5 min and pauses in hidden tabs
- [x] Hero banner PNG 1.5 MB -> JPG; admin login logo 154 KB -> 26 KB
- [x] Pages sent as no-store: browsers were replaying old HTML after a deploy and asking for deleted chunks
- [x] Deployed and verified live

## Phase B: storefront per-request cost
- [x] Root layout stops fetching the whole catalogue (public category API sends `product_count` + `image`; needs the API deployed first)
- [ ] Unknown product slug answers 200 with a skeleton instead of 404
- [ ] Admin edits reach the storefront only when the 60 s cache expires: the Worker cache is per data centre, a real purge needs a shared store (new service, owner approval)
- [x] Upstream API responses cached inside the Worker (warm pages 0.85-1.2 s -> 0.07-0.13 s)
- [x] Listing pages send slim product data (`forListing`); single-language strings sent once
- [x] Cart / wishlist context values memoised (drawer state still in the same context)
- [x] Payment methods fetched on the server
- [x] Bell low-stock count from a count endpoint (API)

## Phase C: admin shared pieces
- [x] `useSoftDeleteList` promoted; four reference-list pages migrated (Warehouses and Brands differ too much, left as they are)
- [x] One `VariantPicker` and one debounced-search hook (CreateOrder's search behaves differently, left)
- [x] Catalog pairs: pricing fields, variant cells, moderation list state
- [x] Fetch hook `useDetailLoad` (4 detail pages); wrapper already existed (`DetailPageState`)
- [x] `Thumbnail`, `LinkCell` (stat cards: only two, and they differ; left)
- [x] Reference lists cached, pages fetched in parallel
- [x] Reference-list cache max age (5 min)
- [x] Money arithmetic through one module (4 of 5 sites)
- [x] Purchase-order totals come from the API as exact decimals (create form uses `sumCostLines`, same rounding)
- [x] Currency label from business profile, not "(BDT)"
- [x] Bell low-stock source asks for the endpoint's own permission (reports or accounting view)

## Phase D: admin consistency
- [ ] Success / warning tokens (needs colour approval)
- [x] App shell on theme tokens; icon buttons use `Button` (`gray-700/800`, `primary-500` have no equal token; left)
- [x] Status tones in one map (open conflicts for owner: inactive coupon grey vs red elsewhere; `disabled`, `refunded`)
- [ ] Card, heading, spacing, table-header rules
- [x] Dark-mode gaps with an existing token (primary button text in dark mode and green/amber text wait on colour approval)
- [x] Bundle: lazy charts, vendor chunk groups; entry 358 kB -> 101 kB (fonts untouched)
- [x] Stale docs replaced

## Phase E: storefront consistency
- [x] Card frame helper; Drawer moves and returns focus; Modal backdrop is a button (badges differ by colour on purpose, left)
- [x] Buttons through `Button` (checked: the raw buttons left are icon, toggle and menu controls `Button` has no variant for)
- [x] Semantic tokens where the value is identical (`border-ink-200`, `text-ink-950/700/800` have no equal token: would change colour, needs approval)
- [x] Auth card, accordion body, contact buttons
- [x] Policies from one source (pages read the published policy; built-in copy is the fallback)
- [x] Dead fonts, CSS and props removed
- [x] Image `sizes` corrected (product card)

## Phase F: storefront language on the server
- [x] Language resolved from a cookie: first HTML and `<html lang>` are in the shopper's language
- [x] Footer and policy pages are server components (`getServerText`); language toggle refreshes them. Other components need hooks or state and stay client
- [x] Home page HTML size checked: 597 kB raw, 34 kB on the wire (brotli, live). 60 product cards by design; no change needed
## Phase G: owner requests (2026-10-08)
- [x] Abandoned checkout: name + phone typed at checkout saved on the open cart; admin Carts shows them with a "Left at checkout" badge

## Phase H: storefront content from the dashboard (owner go-ahead 2026-10-08, after the hardcoded-content audit)
- [x] Backend: hero slides + promo lines (models, migration, admin CRUD, public `storefront-content/`), `about` on the business profile
- [x] Admin: Storefront content screen (hero slides, promo lines), About fields on the business profile form
- [x] Storefront home: hero slides and promo strip read the API (static fallback), false "free delivery over ৳2,000" line removed, Trending shelf uses the `trending` flag, Promotion tile hidden with no discounts
- [x] Storefront wiring: store name, legal name, opening hours, about from the profile; policy effective date; shipping-policy page; policy links only when published; all socials in structured data; coupon expiry; carrier on track-order
- [x] Merge the four branches, run checks once, local browser pass

- [x] Storefront orders are never recorded as paid: COD is confirmed with the cash still owed, other methods wait for staff to verify
- [x] Staff capture COD cash later (confirmed, shipped or delivered order); shipment dialog asks the courier for the balance still owed
- [x] Invoice paid figure counts money received minus refunds
- [x] Customer self-payment endpoint removed
- [x] Cancel takes the order lock and refuses once a consignment is out
- [x] Manual status override limited to an explicit table
- [x] Checkout charges today's price for a saved cart
- [ ] Owner decisions D1-D10 before Phases 1-5 of the plan

## Phase J: one kind per product, no leaks between shops (owner "continue" 2026-10-08; plan Phase 1, defaults D6 + D9)
- [x] `manage.py report_product_kind_mismatches` (report only)
- [ ] Owner fixes the products the report lists, then backend validation is switched on

## Phase K: finish the plan (owner "continue ... you must complete" 2026-10-08, answers in the plan section 4)
- [x] K1 Remove fallback and legacy paths (storefront built-in hero/promo, older-API branches, transitional shop rule)
- [x] K3 Phase 2: order_type, mixed basket blocked, storefront checkout methods COD/bKash/Nagad



- [x] M1 Server rules, `kind` filter on every list, reporting split, `fix_product_kind_mismatches`
- [x] M2 Catalog: products, categories, variants, forms per kind
- [x] M4 Stock section shows stock only (inventory, sales, logistics)
- [x] M5 Home, reports, settings split
- [x] Purchasing split by kind (purchase orders, goods receipts, bills, payments), owner "no shared anything" 2026-10-09
- [x] Duplicate React key warning on `/products`: nested fragment in header actions, keys fixed in `PageHeader`
- [ ] Production: run `fix_product_kind_mismatches` (dry run first) only with a backup and the owner's go-ahead

## Phase N: nothing shared between the halves (owner "no shared anything", "fix the rest and deep dive" 2026-10-09)
- [x] N1 Suppliers and brands carry a kind; lists and pickers per half
- [x] N2 Ledger reports: sales and cost of goods per kind; what cannot be split, stated with reason
- [x] N4 Deep audit (44 findings; fixes tracked as N5-N7) of every dashboard page and admin endpoint
- [x] Merge, routes, typecheck, full backend suite once (2305 passed), browser pass
- [ ] Production, only with backup and owner go-ahead, dry run first: `fix_product_kind_mismatches`, `split_shared_suppliers_and_brands`, `split_both_placements`, `backfill_journal_kind`
- [ ] Bookkeeper: deposit credited to Accounts Receivable (no deposits-held account), Refund Payable never credited, vendor bill dated on due date, `stock_intake` posts no journal entry

## Phase P: the last shared things (owner "fix rest" 2026-10-09)
- [x] P1 Delivery rates and payment methods per kind; own set-up page per half
- [x] P3 Expenses can belong to one half; per-kind profit and loss includes them
- [x] P4 Small leftovers: storefront badges, hero tile, "On sale" filter, coupon refusal at checkout, page titles, order history query
- Not in this phase (bookkeeper first): deposit account, Refund Payable, vendor bill date, stock intake posting

## Phase Q: promotions (change request, owner "go ahead build it" 2026-10-09)
- [x] Q1 API: timed sales (percent off; all stock, categories, brands or products), coupon start date, once-per-customer limit, maximum discount and category/brand scope, free delivery over an amount
- [x] Q2 Dashboard: Shop > Marketing > Sales, new coupon fields, free delivery amount in Shop settings
- [x] Q3 Storefront: sale price, badge and end date, offers filter, free delivery line, new coupon messages (en + bn)
- [x] Merge, full backend suite once (2424 passed, 3 failed; all three fixed and re-run by file), browser check of storefront, dashboard and API
- [ ] Production: `migrate` only (three schema migrations, no data command), with the Phase P deploy
- [ ] Not hand-tested: once-per-customer limit, a placed order with free delivery, sale on brands or picked products, Bangla pages, mobile

## Phase R: product options and variants (change request, owner "generic options setup" 2026-10-09)
Any option name with its own value list per product (up to 3); variants are combinations picked from those lists, never typed.
- [x] R1 API: options, values, variant combinations, rules, order-line snapshot, images per option value, specs and highlights, import/export, dry-run command `move_colour_size_to_options`
- [x] R2 Dashboard: options editor, combinations table, images per option value, specifications editor
- [x] R3 Storefront: generic picker with per-combination availability, photos follow the option, variant title in cart, checkout and order history (en + bn)
- [x] Merge, run the command on the local DB, full backend suite once, browser check of storefront, dashboard and API
- [ ] Production: deploy API before the storefront; `migrate`, then `move_colour_size_to_options` (dry run, then `--apply`) after a backup and the owner's go-ahead
