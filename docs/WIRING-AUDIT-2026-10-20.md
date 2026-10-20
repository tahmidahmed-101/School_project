# Wiring audit, 2026-10-20

Read-only audit of backend, storefront and admin after merging origin/main (c7d3232). Findings come from grep and
route dumps; the two marked (checked) were re-verified by hand. Nothing here is fixed yet.

Clean: all 72 models used, every view routed, one migration leaf per app (`makemigrations --check` clean), admin
routes/nav/URLs/permission keys match the backend, no Celery or signals to wire, storefront env vars and metadata fine.

## High: customer-facing
- `checkout-response-missing-preorder-fields` (checked): `GuestOrderSerializer` (backend/api/v1/public/checkout/serializers.py:49) lacks `order_type` and `deposit_due`; OrderSuccess shows NaN and the wrong continue link for pre-orders.
- `account-area-missing`: no frontend for customer addresses, profile, order cancel, returns, wishlist API, notifications, sessions, email/phone verification.
- `checkout-not-prefilled-for-customers`: CheckoutView never fills from the logged-in user.
- `no-purchase-or-funnel-events`: only PageView fires; no ViewContent/AddToCart/InitiateCheckout/Purchase, no `event_id`, no CAPI.
- `no-payment-gateway`: SSLCommerz/bKash/Nagad are labels only; customers cannot submit TrxID or sender number (`no-customer-payment-proof`).
- `cod-never-captured`: delivery does not capture the COD payment; `Shipment.cod_amount` defaults to 0 so couriers may collect nothing.

## High: backend integrity
- `reservation-sweeper-off-and-unsafe`: sweeper profile off in prod; when on, it releases reservations of paid, unshipped orders (oversell). Sweep only awaiting_payment orders, run `backfill_shipped_reservations --apply`, then enable.
- `advance-only-block-unenforced`: PhoneBlock ADVANCE_ONLY never checked at checkout; `auto_flag` never called.
- `refund-payable-never-clears`: postings.py:343 debits Refund Payable, nothing credits it; RMA and refund not linked.
- `lowstock-unconfigurable`: nothing sets `reorder_point` / `target_stock_level`; low-stock summary is empty.
- `coa-not-seeded` (checked): chart of accounts only from `seed_chart_of_accounts` (manual) or demo seed. Prod has 17 accounts; a fresh DB breaks on first payment/shipment.

## Medium
- `coupon-not-released-on-cancel`: cancel/delete order keeps the coupon use.
- `staff-line-edit-skips-money`: line edits skip coupon, shipping and pending payment recalculation.
- `po-status-bypass`: PATCH status=received sets a PO received with no GRN; cancelled can reopen.
- `multi-bill-per-po`: two bills pass the 3-way match for one PO; accrual dated by due_date.
- `preorder-ships-unpaid-balance`: no balance-due gate at shipment; stage tracking decoupled from payment.
- `rma-admin-actions-bypass`: Django admin actions bulk-update RMA status, skipping `returned_quantity` give-back.
- `order-status-override-no-ui`: admin cannot close or confirm an order.
- `variant-import-export-no-ui`, `stock-lookup-quick-products-no-consumer`, `option-suggestions-no-ui`, `return-detail-no-refund-link`.
- `backend-english-errors-on-bn`: 400/409 messages shown verbatim on Bangla pages.
- `phone-bangla-digits-and-register`: `isBdMobile` strips Bangla digits; register/login skip the shared bdPhone.
- `stale-cart-never-validated`, `money-uses-js-numbers` (cart/checkout), `wishlist-local-only`, `coupon-ignores-customer-limit-input`.
- `revalidate-endpoint-dead`: route, secret and fetch tags inert; edge cache cannot be purged. `cf-incremental-cache-none`: unbounded `?x=` page-cache keys (worker.ts:15).
- `cf-deploy-untraced`: storefront/admin `cf:deploy` lack `record_release`.
- `email-unconfigurable`: no SMTP settings. `env-example-gaps`: BUSINESS_*, CURRENCY_SYMBOL, MEDIA_ROOT, NUM_PROXIES, REDIS_URL, STOCK_RESERVATION_TTL_HOURS, DATABASE_URL, SECURE_HSTS_SECONDS, SECURE_SSL_REDIRECT missing from examples.
- `preorder-terms-acceptance-not-sent`: acceptance not stored on the order.

## Low
- Unreachable statuses: RMA closed, shipment pending, fraud case under review, vendor bill overdue, journal draft.
- Public endpoints with no caller (bundles, shipping-options/zones, category detail, unsubscribe); no unsubscribe page; `carrier_id` never sent.
- Unused API fields (variant color/size/wholesale, business website); write-only model fields (StaffPermission.granted_at, RiskAssessment.features_used, PhoneRiskProfile counters).
- 15 unused i18n keys (dictionary.ts); ~55 needless type exports in admin; `PageHeading` wrapper; dead selectors and the duplicate money module in backend.
- SEO: `SearchAction` JSON-LD vs robots disallow, `llms.txt` present without request, `/shop?category=<unknown>` answers 200, hardcoded districts, `generateStaticParams` likely inert under `force-dynamic`.
- One-off commands unscheduled; confirm `reset_catalog_and_orders` has a prod guard.
- Branch `feature/guest-checkout-payment-shipping-coupon` has one stale commit reverting the PO-notes fix; not merged on purpose.

## Open decisions
Payment gateway vs manual capture; Cloudflare R2; seed values (USD→BDT 120, cost 70%, pre-order 95%, 30/45 day windows);
check prod for leftover `@simpleadmin.demo` users; rotate the Cloudflare token.
