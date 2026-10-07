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
- [ ] Deployed and verified live

## Phase B: storefront per-request cost
- [ ] Root layout stops fetching the whole catalogue (API: category count + image)
- [ ] Upstream API responses cached inside the Worker
- [ ] Pre-order and shop pages send slim product data; single-language strings not doubled
- [ ] Cart / wishlist context values memoised; drawer state split out
- [ ] Payment methods fetched on the server
- [ ] Bell low-stock count from a count endpoint (API)

## Phase C: admin shared pieces
- [ ] `useSoftDeleteList` promoted; six reference-list pages migrated
- [ ] One `VariantPicker`
- [ ] Catalog pairs: pricing fields, variant columns, moderation list
- [ ] One loading / error / content wrapper; one fetch hook
- [ ] `StatCard`, `Thumbnail`, `RefCell` / `LinkCell`
- [ ] Reference lists cached, pages fetched in parallel
- [ ] Money arithmetic through one module
- [ ] Currency label from business profile, not "(BDT)"

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
