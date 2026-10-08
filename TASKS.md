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
- [x] Header: Home and Shop all removed, Ready stock added beside Pre-order (PR #19)
- [x] Abandoned checkout: name + phone typed at checkout saved on the open cart; admin Carts shows them with a "Left at checkout" badge
- [x] Pre-order stages: owner's 24 stages on the order, admin sets and filters them, each change logged, customer sees them on track-order

## Phase H: storefront content from the dashboard (owner go-ahead 2026-10-08, after the hardcoded-content audit)
- [x] Backend: hero slides + promo lines (models, migration, admin CRUD, public `storefront-content/`), `about` on the business profile
- [x] Admin: Storefront content screen (hero slides, promo lines), About fields on the business profile form
- [x] Storefront home: hero slides and promo strip read the API (static fallback), false "free delivery over ৳2,000" line removed, Trending shelf uses the `trending` flag, Promotion tile hidden with no discounts
- [x] Storefront wiring: store name, legal name, opening hours, about from the profile; policy effective date; shipping-policy page; policy links only when published; all socials in structured data; coupon expiry; carrier on track-order
- [x] Merge the four branches, run checks once, local browser pass
