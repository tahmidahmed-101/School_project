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
- [ ] Root layout stops fetching the whole catalogue (API: category count + image); low value now the answer is cached
- [ ] Unknown product slug answers 200 with a skeleton instead of 404
- [ ] Admin edits reach the storefront only when the 60 s cache expires: /api/revalidate cannot purge it
- [x] Upstream API responses cached inside the Worker (warm pages 0.85-1.2 s -> 0.07-0.13 s)
- [ ] Pre-order and shop pages send slim product data; single-language strings not doubled
- [ ] Cart / wishlist context values memoised; drawer state split out
- [ ] Payment methods fetched on the server
- [x] Bell low-stock count from a count endpoint (API)

## Phase C: admin shared pieces
- [x] `useSoftDeleteList` promoted; four reference-list pages migrated (Warehouses and Brands differ too much, left as they are)
- [x] One `VariantPicker` and one debounced-search hook (CreateOrder's search behaves differently, left)
- [ ] Catalog pairs: pricing fields, variant columns, moderation list
- [ ] One loading / error / content wrapper; one fetch hook
- [ ] `StatCard`, `Thumbnail`, `RefCell` / `LinkCell`
- [x] Reference lists cached, pages fetched in parallel
- [ ] Reference-list cache has no max age: another staff member's edit shows only after a reload
- [x] Money arithmetic through one module (4 of 5 sites)
- [ ] Purchase-order totals still on floats: unit cost has 4 decimals, the money module needs an exact multiply first (also PurchaseOrderCreate.tsx:66)
- [x] Currency label from business profile, not "(BDT)"
- [ ] Bell offers low-stock to inventory-only staff, but the endpoint needs reports permission (403, shows nothing)

## Phase D: admin consistency
- [ ] Success / warning tokens (needs colour approval)
- [ ] App shell on theme tokens; icon buttons use `Button`
- [ ] Status tones in one map; conflicts resolved
- [ ] Card, heading, spacing, table-header rules
- [ ] Dark-mode gaps
- [ ] Bundle: lazy charts, combobox, chunk grouping, fonts
- [ ] Stale docs replaced

## Phase E: storefront consistency
- [ ] `Card`, `Badge`, overlay base with dialog role and focus
- [ ] Buttons through `Button`
- [ ] Semantic tokens for surface, border, status
- [ ] Shared grid class, auth card, contact buttons, accordion body
- [ ] Policies from one source
- [ ] Dead fonts, CSS and props removed
- [ ] Image `sizes` corrected

## Phase F: storefront language on the server
- [ ] Language resolved from a cookie; static content rendered as server components
