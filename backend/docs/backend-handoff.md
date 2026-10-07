# Backend Handoff

A full map of the Django backend: what it is, how it's structured, every app's
models/services, and every API endpoint. Written 2026-09-30 for onboarding —
cross-check against code before relying on specifics, this is a snapshot.

## 1. What this is

A Bangladesh-focused e-commerce backend (Django 5 + DRF), covering storefront,
admin back-office, inventory/warehouse, procurement, double-entry accounting,
COD fraud/risk scoring, and courier dispatch (Pathao / Steadfast / RedX).
Currency defaults to ৳ (BDT). No payment gateway integration — payments are
recorded manually/COD (see §6.3).

## 2. Tech stack

- **Django 5** + **Django REST Framework**, JWT auth (`djangorestframework-simplejwt`)
- **drf-spectacular** for OpenAPI schema (auth-gated in production)
- **django-filter** for querysets, **django-cors-headers** for CORS
- DB: SQLite in dev, Postgres via `psycopg` in production (`dj-database-url`)
- Cache: Redis if `REDIS_URL` set, else DB-backed cache (shared across gunicorn workers — never `LocMemCache`, that would divide throttle rates per worker)
- **Twilio** for SMS OTP; email backend configurable (console in dev)
- **WeasyPrint** for PDF documents (invoices, POs, vendor bills)
- **openpyxl** for XLSX import/export; `qrcode` + `python-barcode` for label generation
- **Pillow** / **pillow-heif** for image processing (HEIC support)
- Tooling: `ruff` (incl. bandit-equivalent `S` rules), `mypy` + django-stubs, `pytest` + `pytest-cov`, `import-linter` (enforces `services → selectors → models` layering per app), `vulture`, `deptry`, `pip-audit`

## 3. Architecture

### 3.1 Layered apps

Each domain app under `backend/apps/<name>/` follows (enforced by import-linter
for accounting, accounts, audit, business, catalog, inventory, logistics,
orders, procurement):

```
models/     — ORM layer, no business logic
selectors/  — read-only queries
services/   — business logic, writes, orchestration
```

`apps/common/` holds shared base models (`FullAuditModel` = UUID PK +
timestamps + soft-delete + actor stamps + active flag — the standard base for
new models), generic admin CRUD viewsets, permissions, pagination, throttling,
PDF rendering, and utilities (barcodes, QR, phone normalization, exports).

Model fields are declared without redundant type annotations — `name =
models.CharField(...)`, not `name: models.CharField = models.CharField(...)`.
django-stubs infers the field's type from the constructor call; the annotation
was dead weight and, in a few places, was actually *hiding* real typing gaps
from mypy (see §9).

### 3.2 API surface

Everything is mounted under `/api/v1/` (`api/v1/urls.py`), split into four
independent trees:

| Tree | Auth | Purpose |
|---|---|---|
| `admin/` | JWT, `IsAdmin` (staff use `IsAdminOrStaffWithPermission` + permission codes) | Back-office management |
| `customer/` | JWT, `IsAuthenticated`/`IsCustomer` | Logged-in storefront account |
| `public/` | none (`AllowAny`) | Anonymous storefront browsing/checkout |
| `webhooks/` | per-provider signature, not session/token | Inbound courier callbacks |

### 3.3 Cross-cutting engines

- **Module toggles** (`apps/business`) — whole feature areas can be switched
  off at runtime (`ModuleSetting` + `MODULE_REGISTRY`); `ModuleEnabledMiddleware`
  403s any `/api/v1/admin/<module>/...` route when its module is off. Distinct
  from per-row `is_active` and per-staff `StaffPermission`. See `docs/modules.md`.
- **Payment method registry** (`apps/orders/constants.py`) — replaces free-text
  `Payment.method` with a closed, admin-toggleable set (`manual` is
  non-withdrawable). See `docs/payment-methods.md`.
- **Money precision tiers** — six `DecimalField` precision tiers (aggregate
  money `14,2`, unit money `12,2`, unit cost `12,4`, percent `5,2`, weight
  `10,3`, hours `8,2`), picked by what the number *is*. See `docs/money-precision.md`.
- **Courier integrations** (`apps/logistics/services/couriers/`) — Pathao,
  Steadfast, RedX gateways behind a common `base.py`/`registry.py` abstraction;
  credentials live on the `Carrier` row, not env vars. Several provider
  contracts are reconstructed from unofficial sources — see `docs/couriers.md`
  for exactly what's unverified before trusting status-mapping edge cases.
- **Fraud/risk engine** (`apps/risk`) — rule-based order scoring at
  checkout/payment, phone-level COD risk profiles, IP/phone blocklists, and
  auto-opened fraud cases above a threshold.
- **Double-entry accounting** (`apps/accounting/services/postings.py`) — domain
  events (goods received, vendor bill/payment, sales shipment/return, customer
  payment/refund, stock adjustment/write-off) auto-generate journal entries;
  nothing posts to the ledger by hand.
- **Inventory ledger** (`apps/inventory`) — `StockItem` is a derived cache,
  never hand-edited; `StockLedgerEntry` is the append-only source of truth
  everything else is summed from.

## 4. Domain apps: models & services

### accounting
- **Models**: `Account` (chart-of-accounts row) · `Expense` · `ExpenseCategory` (simple-mode category resolving to a ledger account) · `JournalEntry` + `JournalEntryLine` (draft/posted double-entry) · `TaxRate`
- **Services**: `accounts.py` (CoA CRUD, protected-relation guards) · `expenses.py` / `expense_categories.py` · `journal.py` · `money.py` (decimal helpers) · `postings.py` — the posting engine (`post_goods_received`, `post_vendor_bill`, `post_vendor_payment`, `post_sales_shipment`, `post_sales_return`, `post_customer_payment`, `post_customer_refund`, `post_stock_adjustment`, `post_stock_writeoff`) · `exports.py`

### accounts
- **Models**: `User` (email-keyed, `role`: admin/staff/customer; `is_guest` marks guest-checkout identities, §13) · `Address` (soft-deletable) · `UserOTP` (6-digit, rate-limited) · `StaffPermission` (granular permission codes)
- **Services**: `authentication.py` (login/JWT) · `sessions.py` (refresh-token/device sessions) · `phone_verification.py` (OTP send/verify) · `addresses.py` · `staff_permissions.py` · `groups.py`, `users.py`

### audit
- **Models**: `AuditLog` (actor + action trail) · `LoginHistory`
- **Services**: `audit.py`, `exports.py`. Owns `RequestMetadataMiddleware` (captures IP/UA, consumed by risk too).

### business
- **Models**: `BusinessProfile` (singleton store identity) · `ModuleSetting` (runtime module on/off + config) · `StorePolicy` (shipping / returns / refund, bilingual, see §14) · `StorePolicyRevision`
- **Services**: `business_profile.py` · `modules.py` (`is_feature_enabled`, `require_feature`, `set_module_enabled`, disable-guards). Owns `ModuleEnabledMiddleware`.
- Registered modules (`ModuleKey`): catalog, inventory, orders, accounting, audit, procurement (depends on inventory+accounting), logistics (depends on orders), reporting, cms. `catalog`/`inventory`/`orders`/`accounting`/`audit` are `can_disable=False`.

### catalog
- **Models**: `Product` (simple/variant type; `meta_keywords` — optional SEO field, admin create/update only) · `ProductVariant` · `Brand` · `Category` (stock/pre-order type) · `ProductImage` · `BundleItem` (kit component) · `ProductReview` · `ProductQuestion` (private until answered + published) · `PriceIssueReport` (staff-only) · `WishlistItem`
- **Services**: `products.py`, `variants.py`, `brands.py`, `categories.py`, `bundles.py`, `reviews.py`, `questions.py`, `price_reports.py`, `wishlist.py` · `variant_import_export.py` (bulk CSV)

### common (shared, not a domain app)
- **Base models**: `UUIDModel` → `TimeStampedModel` → `SoftDeleteModel`; `ActivatableModel`; `UserStampedModel`; `FullAuditModel` (full stack — default for new models)
- **Shared infra**: `generics.py` (admin CRUD viewsets + bulk ops), `pagination.py`, `permissions.py` (`IsAdmin`, `IsCustomer`, `IsAdminOrStaffWithPermission`/`require_staff_permission`, `ModuleEnabled`/`require_module`), `exception_handler.py`, `throttling.py`, `responses.py`, `schema.py`, `middleware.py` (PUT→PATCH shim), `pdf/` (WeasyPrint document rendering), `utils/` (barcodes, QR, phone normalization, export, validators), `services/soft_delete.py`, `services/sms.py`, `services/demo_seed/` (demo data seed + wipe)

### inventory
- **Models**: `Warehouse` · `StockItem` (derived on-hand/reserved cache) · `StockLedgerEntry` (append-only movement log, source of truth)
- **Services** (`stock.py`): `record_movement`, `reserve_stock`/`release_reservation`, `post_adjustment`/`post_bulk_adjustments`, `stock_intake`, `write_off_stock`, `materialize_stock_items`, `get_or_create_default_warehouse` · `exports.py`

### logistics
- **Models**: `Carrier` (Pathao/Steadfast/RedX config + credentials) · `ShippingZone` · `ShippingRate` · `CourierWebhookEvent` (inbound webhook inbox, idempotency-keyed)
- **Services**: `courier_selection.py` (`select_courier`) · `rates.py` · `couriers/` — `pathao.py`, `steadfast.py`, `redx.py`, `base.py`/`providers.py`/`registry.py`, `http.py`, `webhooks.py`, `recipient.py`, `exceptions.py`

### marketing
- **Models**: `NewsletterSubscriber`
- **Services**: `subscribers.py`

### orders — commerce core
- **Models**: `SalesOrder` + `SalesOrderLine` (pending → awaiting_payment → confirmed → shipped → delivered → cancelled/closed) · `Payment` · `PaymentMethodSetting` · `Coupon` · `StockReservation` · `ReturnRMA` + `ReturnRMALine` (requested → approved/rejected → received → closed, with per-line grading) · `Shipment` + `ShipmentLine`
- **Services**: `checkout.py` (cart → order, weight calc, pre-order detection) · `carts.py`, `guest_checkout.py` · `payments.py` (`capture_payment`, `refund_payment`, triggers risk assessment) · `coupons.py` (create/apply/preview/revalidate) · `reservations.py` (expiry release, ties into inventory) · `returns.py` (RMA workflow) · `shipments.py` (`create_shipment`, `update_shipment_status`, `dispatch_to_courier`, `_auto_select_carrier`) · `orders.py` (CRUD/state transitions) · `payment_methods.py`, `address_snapshot.py`, `invoice_document.py` (PDF), `exports.py`

### procurement
- **Models**: `Supplier` · `PurchaseOrder` + `PurchaseOrderLine` · `GoodsReceiptNote` + `GRNLine` (QC pass/reject per line) · `VendorBill` + `VendorPayment`
- **Services**: `suppliers.py`, `purchase_orders.py`, `goods_receipt.py` (→ `post_goods_received`), `vendor_bills.py` (→ `post_vendor_bill`/`post_vendor_payment`), `purchase_order_document.py`/`vendor_bill_document.py` (PDF)

### reporting
- Read-only: `selectors/` only, no models/services of its own — queries across other apps' tables for dashboards and exports.

### risk — fraud/COD anti-fraud engine
- **Models**: `RiskAssessment` (rule-based score per order) · `FraudCase` (auto-opened above threshold) · `PhoneRiskProfile` (aggregated delivery history per recipient phone — core COD signal) · `PhoneBlock` (checkout block keyed on normalized phone) · `IPBlock`
- **Services**: `scoring.py` (`assess_order_risk`, order-value thresholds, fraud case numbering) · `phone_profile.py` (`rebuild_phone_profile`, `phone_risk_features`) · `blocklist.py`/`ip_blocklist.py` (`is_blocked`, `auto_flag`) · `fraud_cases.py` (`resolve_fraud_case`) · `guidance.py` (human-readable risk explanations)

> **Note**: `docs/money-precision.md` references `Payslip`/`SalaryStructure`/`PayrollRun` — these models do **not** exist in the current codebase. That section of the doc is stale/aspirational (no payroll app built yet).

## 5. API endpoints

Auth column: who may call it. All admin/customer routes require a valid JWT
access token; `IsAdmin` staff bypass permission checks, other staff need the
matching `StaffPermission` code.

### 5.1 Admin (`/api/v1/admin/`) — `IsAdmin` / staff+permission

**Users** `users/`
- `GET/POST /` list/create · `POST /bulk-deactivate/`
- `GET/PATCH/DELETE /<id>/` · `POST /<id>/restore/` · `GET /<id>/addresses/`
- `POST /<id>/activate/` `/deactivate/` `/soft-delete/` `/reset-password/` `/set-role/`

**Staff** `staff/`
- `GET/POST /` · `GET /permission-codes/`
- `GET/PATCH/DELETE /<id>/` · `POST /<id>/restore/` · `GET/PUT /<id>/permissions/`

**Audit** `audit/`
- `GET /` · `GET /export/` · `GET /login-history/` · `GET /<id>/`

**Catalog** `catalog/`
- `GET/POST /brands/`, `GET/PATCH/DELETE /brands/<id>/`, `POST /brands/<id>/restore/`, `POST /brands/bulk-status/`
- `GET/POST /categories/`, `GET/PATCH/DELETE /categories/<id>/`, `POST /categories/<id>/restore/`
- `GET/POST /products/`, `POST /products/bulk-status/`, `GET/PATCH/DELETE /products/<id>/`, `POST /products/<id>/restore/`
- `GET/POST /products/<id>/variants/`, `POST /products/<id>/variants/generate/`
- `GET/POST /products/<id>/images/`, `GET/PATCH/DELETE /images/<id>/`
- `PATCH/DELETE /reviews/<id>/` (moderation)
- `GET /questions/` (`?status=pending|answered|published`), `PATCH/DELETE /questions/<id>/` (answer / publish)
- `GET /price-reports/` (`?status=open|resolved|dismissed`), `GET/PATCH /price-reports/<id>/`
- `GET /variants/`, `GET /variants/export/`, `POST /variants/import/`, `GET/PATCH/DELETE /variants/<id>/`
- `GET/POST /bundles/`, `GET/PATCH/DELETE /bundles/<id>/`, `POST /bundles/<id>/restore/`

**Media** `media/`
- `POST /uploads/`

**Inventory** `inventory/`
- `GET/POST /warehouses/`, `GET/PATCH/DELETE /warehouses/<id>/`
- `GET /stock-items/`, `GET/PATCH /stock-items/<id>/`
- `GET /ledger-entries/`, `GET /ledger-entries/export/`
- `POST /adjustments/`, `POST /adjustments/bulk/`, `POST /write-offs/`
- `GET /stock-status/`, `GET /lookup/`
- `POST /intake/`, `POST /quick-products/`

**Procurement** `procurement/`
- `GET/POST /suppliers/`, `GET/PATCH/DELETE /suppliers/<id>/`, `POST /suppliers/<id>/restore/`
- `GET/POST /purchase-orders/`, `GET/PATCH/DELETE /purchase-orders/<id>/`, `GET /purchase-orders/<id>/pdf/`
- `POST /purchase-orders/<id>/lines/`, `GET/PATCH/DELETE /purchase-orders/<id>/lines/<line_id>/`
- `POST /purchase-orders/<id>/submit/`, `POST /purchase-orders/<id>/cancel/`
- `GET/POST /goods-receipts/`, `GET/PATCH /goods-receipts/<id>/`
- `GET/POST /vendor-bills/`, `GET/PATCH/DELETE /vendor-bills/<id>/`, `GET /vendor-bills/<id>/pdf/`
- `POST /vendor-bills/<id>/void/`, `POST /vendor-bills/<id>/payments/`
- `GET /vendor-payments/`, `GET/PATCH /vendor-payments/<id>/`

**Orders** `orders/`
- `GET /`, `GET /export/`, `GET/PATCH /<id>/`, `GET /<id>/invoice/`, `POST /<id>/status/`
- `GET/PATCH /<id>/lines/<line_id>/`, `POST /<id>/cancel/`
- `POST /<id>/shipments/`, `POST /<id>/returns/`, `POST /<id>/capture-payment/`
- `GET /carts/` — open, non-empty carts incl. guest carts (`?search=` matches the saved contact phone and the customer's email/phone/name; see §15)
- `GET /payments/`, `GET/PATCH /payments/<id>/`, `POST /payments/<id>/refund/`
- `GET /reservations/`, `GET/PATCH /reservations/<id>/`, `POST /reservations/<id>/release/`
- `GET/POST /shipments/`, `GET/PATCH /shipments/<id>/`, `POST /shipments/<id>/status/`, `POST /shipments/<id>/dispatch/`
- `GET /returns/`, `GET/PATCH /returns/<id>/`, `POST /returns/<id>/approve/` `/reject/` `/receive/`
- `POST /returns/lines/<line_id>/grade/`

**Coupons** `coupons/`
- `GET/POST /`, `GET/PATCH/DELETE /<id>/`, `POST /<id>/restore/`

**Marketing** `marketing/`
- `GET /subscribers/`, `GET /subscribers/export/`, `GET/PATCH/DELETE /subscribers/<id>/`

**Logistics** `logistics/`
- `GET/POST /carriers/`, `GET/PATCH/DELETE /carriers/<id>/`, `POST /carriers/<id>/restore/`
- `GET/POST /zones/`, `GET/PATCH/DELETE /zones/<id>/`, `POST /zones/<id>/restore/`, `POST /zones/<id>/rates/`
- `GET /rates/`, `GET/PATCH/DELETE /rates/<id>/`

**Accounting** `accounting/`
- `GET/POST /accounts/`, `GET/PATCH/DELETE /accounts/<id>/`, `POST /accounts/<id>/restore/`
- `GET /journal-entries/`, `GET /journal-entries/<id>/`, `POST /journal-entries/<id>/reverse/`
- `GET/POST /expenses/`, `GET/PATCH/DELETE /expenses/<id>/`, `POST /expenses/<id>/restore/`
- `GET/POST /expense-categories/`, `GET/PATCH/DELETE /expense-categories/<id>/`, `POST /expense-categories/<id>/restore/`
- `GET/POST /tax-rates/`, `GET/PATCH/DELETE /tax-rates/<id>/`, `POST /tax-rates/<id>/restore/`
- `GET /reports/profit-and-loss/` `/balance-sheet/` `/cash-flow/` `/inventory-valuation/`

**Reporting** `reporting/`
- `GET /dashboard/`, `GET /sales-trend/`, `GET /stock-turnover/`, `GET /low-stock/`

**Settings / Business** `settings/`
- `GET/PATCH /business-profile/`
- `GET /integrations/`
- `GET /modules/`, `GET/PATCH /modules/<key>/`
- `GET /policies/`, `GET/PATCH /policies/<kind>/`, `GET /policies/<kind>/revisions/` (`settings.view` reads, `settings.manage` writes; see §14)
- `GET /payment-methods/`, `GET/PATCH /payment-methods/<key>/`

**Risk** `risk/`
- `POST /orders/<order_id>/assess/`
- `GET /cases/`, `GET/PATCH /cases/<id>/`, `POST /cases/<id>/resolve/`
- `GET/POST /ip-blocklist/`
- `GET/POST /phone-blocklist/`, `POST /phone-blocklist/<phone_number>/lift/`

*(HTTP methods on list/detail routes above follow standard DRF `ListCreateAPIView`/`RetrieveUpdateDestroyAPIView` conventions — verify exact method sets per view if wiring a client strictly.)*

### 5.2 Customer (`/api/v1/customer/`) — JWT, `IsAuthenticated`/`IsCustomer`

**Auth** `auth/` (mixed `AllowAny`/`IsAuthenticated`)
- `POST register/`, `POST login/` (AllowAny)
- `POST refresh/` (rotates access token from the caller's HttpOnly refresh cookie), `POST logout/` (AllowAny)
- Login, refresh and logout are shared by the storefront and the dashboard. Each app sends
  `X-Auth-Client: storefront | dashboard` (absent = storefront) and gets its own cookie
  (`vtc_refresh` / `vtc_refresh_admin`), so the two sessions are independent in one browser.
  The header only picks the cookie. A customer account asking for a dashboard session is
  refused with 403 `auth_not_staff`; admin APIs authorise from the user as before.
- `GET me/`
- `POST request-email-verification/`, `POST verify-email/`
- `POST request-phone-verification/`, `POST verify-phone/`
- `POST request-phone-change/`, `POST confirm-phone-change/`
- `POST forgot-password/`, `POST reset-password/` (AllowAny)

**Profile** `profile/`
- `GET/PATCH ""`, `PATCH image/`, `POST change-password/`

**Addresses** `addresses/`
- `GET/POST ""`, `GET/PATCH/DELETE <id>/`, `POST <id>/set-default/`

**Sessions** `sessions/`
- `GET ""`, `POST <id>/revoke/`, `POST revoke-others/`

**Orders** `orders/`
- `GET cart/`, `GET/POST cart/lines/`, `PATCH/DELETE cart/lines/<line_id>/`
- `PATCH cart/contact/` — save the phone typed at checkout on the open cart (see §15)
- `POST cart/coupon/`, `POST cart/shipping-quote/`, `GET cart/shipping-options/`, `GET cart/shipping-zones/`
- `POST cart/checkout/`, `POST cart/payment/`
- `GET ""` (order history), `GET <id>/`, `POST <id>/cancel/`
- `GET/POST <id>/returns/`, `GET returns/<rma_id>/`

**Wishlist** `wishlist/`
- `GET/POST ""`, `GET/DELETE <product_id>/`

**Reviews** `reviews/`
- `POST products/<product_id>/`, `GET/PATCH/DELETE <review_id>/`

**Notifications** `notifications/`
- `GET ""` (`?unread=true`; response adds `unread_count`), `POST <id>/read/`, `POST read-all/`
- In-app only (`accounts.Notification`), created by `apps.accounts.services.notifications.notify` on order cancel / status override, shipment shipped / out for delivery / delivered / failed, and return approved / rejected / received. Guest identities are skipped.

**Questions** `questions/` (throttle scope `product_question`)
- `GET ""` (own questions, incl. pending), `POST products/<product_id>/`

**Price reports** `price-reports/` (throttle scope `price_report`)
- `POST products/<product_id>/` (no read endpoint — staff-only)

### 5.3 Public (`/api/v1/public/`) — anonymous, `AllowAny`

**Catalog** `catalog/`
- `GET categories/`, `GET categories/<slug>/`
- `GET products/`, `GET products/<slug>/`, `GET products/<slug>/reviews/`
- `GET products/<slug>/questions/` (answered + published only), `GET products/<slug>/related/?limit=1-24`
- `GET bundles/`, `GET bundles/<slug>/`

**Marketing** `marketing/`
- `POST subscribe/`, `POST unsubscribe/`

**Checkout** `checkout/` (`AllowAny`: anonymous → guest identity, signed in → `request.user`; see §13)
- `POST ""`, `POST coupon/`, `GET coupons/` (coupons flagged `show_on_storefront`), `POST shipping-quote/`, `GET shipping-options/`, `GET shipping-zones/`

**Cart** `cart/` (guest carts; every call but the first sends `X-Guest-Cart-Token`)
- `POST ""` (start a cart; returns the token once), `GET ""`
- `POST lines/`, `PATCH/DELETE lines/<line_id>/`
- `PATCH contact/` — save the phone typed at checkout on the open cart (see §15)

**Tracking** `tracking/`
- `POST orders/track/` (by order number + email/phone)

**Business** (mounted at public root)
- `GET business-profile/`, `GET payment-methods/`
- `GET policies/<kind>/` — `shipping`, `returns`, `refund`; 404 `policy_unavailable` until published (see §14)

### 5.4 Webhooks (`/api/v1/webhooks/`) — signature-verified

**Couriers** `couriers/`
- `POST <carrier_id>/` — inbound courier status callback, verified via `CourierGateway.verify_webhook` against the carrier's own webhook secret (not a session/API token)

## 6. Security & platform behavior

- **JWT**: 15-min access / 1-day refresh (30 days with `remember_me`), refresh
  token rotated + blacklisted on use, stored in an HttpOnly cookie
  (`SameSite=Lax`; `vtc_refresh` for the storefront, `vtc_refresh_admin` for the
  dashboard, see `REFRESH_COOKIE_NAMES`) — not the response body or localStorage.
- **Throttling** (`REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]`): anon 300/hr,
  user 2000/hr, auth 20/min (login attempts per IP), `login_account` 10/min
  (per submitted account), `public_read` 1000/hr, `media_upload` 120/hr,
  `coupon` 20/min, `otp` 5/hr, `guest_checkout` 20/hr, `tracking` 30/hr.
  `NUM_PROXIES` governs how many `X-Forwarded-For` hops are trusted.
- **Uploads**: 10 MB per file (enforced in code), 5 MB non-file form data,
  1000 max form fields.
- **Schema docs**: drf-spectacular schema requires `IsAuthenticated` in
  production (open in `config.settings.local`).
- **Logging**: separate rotating logs for `app`, `security` (auth
  failures/permission denials), and `audit` (CRUD/admin actions + login
  history), each 5 MB × 5 backups.

## 7. Management commands (seed / maintenance)

- `accounting seed_chart_of_accounts` — bootstrap CoA
- `accounts seed_data` — seed baseline accounts
- `business apply_simple_ecommerce_profile` — apply the single-warehouse/simple business profile preset
- `catalog seed_starter_catalog` / `seed_storefront_catalog` / `seed_storefront_bundles` / `reset_catalog_and_orders`
- `common seed_demo` — full demo dataset (+ wipe, via `apps/common/services/demo_seed/`)
- `orders release_expired_reservations` — cron-style TTL sweep for stale stock reservations (`STOCK_RESERVATION_TTL_HOURS`, default 24h)
- `orders backfill_shipped_reservations` — one-off data-fix command

## 8. Where to go deeper

- `docs/modules.md` — module-toggle system, three-tier access model, how to add a module
- `docs/payment-methods.md` — payment method registry and enforcement
- `docs/money-precision.md` — decimal precision tiers (flagging the stale payroll reference, §4)
- `docs/couriers.md` — per-provider (Pathao/Steadfast/RedX) API contracts and what's unverified
- `docs/modularity-plan.md`, `docs/modularity-phase4-handoff.md` — history of the modularity refactor

## 9. Recent changes (2026-09-30): model-field typing cleanup

Model field declarations across every app were changed from redundant
explicit annotations to plain assignment:

```python
# before
name: models.CharField = models.CharField(max_length=150, unique=True)
# after
name = models.CharField(max_length=150, unique=True)
```

django-stubs infers a field's Python type from the constructor call, so the
annotation added nothing — and in several places it was actively suppressing
more precise inference, which let real typing gaps through mypy unnoticed.
346 field declarations across 44 model files were mechanically rewritten (pure
substitution, no behavior change, verified with `ruff`, `manage.py check`, and
the full test suite before and after).

Removing the annotations caused mypy to re-check dependent modules more
precisely and surface 14 previously-hidden errors project-wide (3 of which —
in `apps/orders/services/shipments.py` — turned out to predate this change
entirely and were just never checked due to stale mypy caching). All 14 were
fixed. Two recurring patterns accounted for most of them:

1. **`TextChoices`-keyed lookup dicts** (e.g. `{Model.Status.X: "label"}`)
   assumed a narrower key type than the field they were being looked up
   against, since a plain `CharField` resolves to `str`, not the choices
   enum. Fixed by annotating the dict explicitly as `dict[str, ...]`
   (`apps/accounts/services/groups.py`, `apps/reporting/selectors/dashboards.py`,
   `apps/procurement/services/{vendor_bill_document,purchase_order_document}.py`,
   `apps/orders/services/shipments.py::_PROGRESSION_RANK`).
2. **FK id lookups typed `str | UUID`** (from query-param parsing) filtered
   directly against a `_id` field mypy now resolves to the PK's real `UUID`
   type. Fixed by coercing to `UUID(str(value))` before filtering
   (`apps/accounting/selectors/expenses.py`, `apps/procurement/selectors/vendor_payments.py`).

Other one-off fixes: `apps/common/models/base.py`'s `FullAuditModel.soft_delete`
keeps its actor parameter generically typed as `models.Model` (so the base
class stays reusable across projects with different user models) with a
`# type: ignore[assignment]` on the now-precisely-typed `deleted_by` FK
assignment; `apps/accounts/services/staff_permissions.py::replace_staff_permissions`
was restructured to build `(code, is_enabled)` tuples instead of loosely-typed
dicts, converting back to the original dict shape only when building the
audit-log `metadata` payload (no change to what gets logged); two `union-attr`
null-check gaps (`apps/audit/services/exports.py`, `apps/orders/services/shipments.py`)
were fixed by checking the actual object (`log.actor is not None`,
`order.shipping_address is not None`) instead of a related `_id` column,
which mypy can't correlate to the object being non-null.

**Net result**: `mypy apps config` now reports **zero errors** — previously
it had 3 pre-existing, unrelated errors that this cleanup happened to surface
and fix as a side effect. Full test suite (1580 tests) green throughout.
Pushed to `main` as commits `2fc6423` (annotation cleanup + first 6 fixes)
and `fa20d0e` (remaining `shipments.py` fixes).

## 10. Recent changes (2026-09-30): Product.meta_keywords

Added an optional SEO meta keywords field to `Product`:

```python
meta_keywords = models.CharField(max_length=255, blank=True, default="")
```

(`apps/catalog/models/product.py`, migration `catalog/0022_product_meta_keywords`.)

Wired through the admin CRUD path only (scope was explicitly "the admin
product create/edit form," not the storefront):

- `apps/catalog/services/products.py` — `create_product()` takes an optional
  `meta_keywords: str = ""` kwarg; `update_product()`'s `allowed_fields` now
  includes it.
- `api/v1/admin/catalog/serializers.py` — added to `ProductSerializer` (read),
  `ProductCreateSerializer`, and `ProductUpdateSerializer`, all
  `required=False, allow_blank=True` — no default forced at the serializer
  layer, matching how `description`/`highlights` are already handled (the
  service function's own default covers the omitted case).
- Test: `apps/catalog/tests/test_api.py::test_admin_can_set_product_meta_keywords_on_create_and_update`
  covers set-on-create and change-on-update; the existing
  `test_admin_can_create_product_with_only_required_fields` now also asserts
  it defaults to `""` when omitted.

**Follow-up**: also exposed read-only on the public catalog API —
`api/v1/public/catalog/serializers.py::PublicProductDetailSerializer` gained
`meta_keywords = serializers.CharField(read_only=True, allow_blank=True)`,
same placement as `description` (detail only, not the list serializer —
per-product SEO metadata only matters on the page a search engine actually
lands on). `GET /api/v1/public/catalog/products/<slug>/` now returns it;
`GET /api/v1/public/catalog/products/` does not. Tests:
`test_public_product_detail_exposes_meta_keywords`,
`test_public_product_list_omits_meta_keywords`.

**Still not done** (out of scope unless asked): nothing renders it into an
actual `<meta name="keywords">` tag — that's a frontend concern, and this
repo's `frontend/` is the storefront, not the admin panel, so the admin
create/edit form itself lives outside this repo too. `create_quick_product()`
(the Stock App's fast-add flow) still doesn't accept it, consistent with that
flow skipping other optional product fields.

Verified: `ruff`, `mypy` (still zero errors — the one `api/v1/webhooks`
error present project-wide predates all of this work and is unrelated),
`manage.py check`, full test suite (1583 tests) all green.

## 11. Recent changes (2026-09-30): pre-order flow bugfixes

Four bugs in the pre-order path, all stemming from one root cause: `SalesOrderLine.is_preorder`
was computed with `variant.is_preorder_active and variant.is_preorder_price_applied` in two
places instead of the single correct rule already implemented on
`ProductVariant.is_preorder_active` (`apps/catalog/models/variant.py` — enabled + within the
date window, independent of `preorder_price`). No model or migration changes were needed;
`is_preorder_active` was already correct.

1. **`apps/orders/services/carts.py::add_line`** and
   **`apps/orders/services/guest_checkout.py::guest_checkout`** both set
   `is_preorder = variant.is_preorder_active` now, not
   `... and variant.is_preorder_price_applied`. Previously, an active pre-order variant with no
   discounted `preorder_price` (or one not below list price) got `is_preorder=False` on its order
   line — invisible to `get_preordered_quantity()`'s capacity count and, worse, indistinguishable
   from a real stocked line at shipment time.
2. **`apps/orders/services/checkout.py::checkout`** now re-derives `is_preorder` from the live
   variant at the exact point it decides whether to reserve stock, and persists it if it
   disagrees with the cart-time value (`line.save(update_fields=["is_preorder"])`) — closing the
   gap where preorder settings could change between cart-add and checkout.
3. **`apps/orders/services/shipments.py::create_shipment`** — the reservation-release + SALES_OUT
   stock-movement block is now skipped entirely for `order_line.is_preorder` lines. It used to run
   unconditionally, and since a pre-order line never has a `StockReservation` (checkout skips
   creating one), it raised `over_release`/`insufficient_stock` — shipping *any* pre-order line
   was broken.
4. **`apps/orders/services/guest_checkout.py::guest_checkout`** now merges `items` by
   `variant_id` (summing quantity) before the per-variant validation loop, matching
   `add_line`'s `get_or_create`-based merge on the cart side, so a payload split into duplicate
   variant entries can't be validated fragment-by-fragment.
5. **`apps/orders/services/carts.py::_check_preorder_stock_limit`** now takes
   `ProductVariant.objects.select_for_update().get(pk=variant.pk)` before reading the running
   preordered total, closing the check-then-write race between two concurrent checkouts for the
   same variant. This is shared by `carts.py`, `checkout.py`, and `guest_checkout.py`. Note: this
   test suite's SQLite DB doesn't support row-level locking (`has_select_for_update` is `False`
   there), so the lock is a no-op in tests — it takes effect on Postgres, the production database.

**Tests** (`apps/catalog/tests/test_services.py`, `apps/orders/tests/test_services.py`,
`apps/orders/tests/test_public_checkout_api.py`): active pre-order without `preorder_price`
correctly flags its cart line; that same pre-order checks out and keeps `is_preorder=True`
through to the order; a pre-order line ships without ever having held a reservation; two separate
orders can't jointly exceed a shared `preorder_stock_limit`; duplicate variant entries in a guest
checkout payload are combined and still capped. All 5 verified to fail against the pre-fix code
(confirmed by temporarily reverting each source file and re-running) and pass with the fix.

Full suite: 1588 tests green (1583 + 5 new). `ruff`, `mypy` (still only the pre-existing,
unrelated `api/v1/webhooks` error), `manage.py check` all clean.

## 12. Recent changes (2026-09-30): public pre-order capacity fields

`PublicProductVariantSerializer` (`api/v1/public/catalog/serializers.py`, used by both
`GET /public/catalog/products/` and `GET /public/catalog/products/<slug>/`) gained three
read-only fields, backend-only — no frontend files touched:

- `preorder_stock_limit` — direct passthrough of the model field (`int | null`)
- `preordered_quantity` — quantity already committed, via the *existing*
  `apps.orders.services.carts.get_preordered_quantities()` batch helper (same one the admin
  catalog API already uses for `can_preorder`) — no new counting logic
- `preorder_remaining` — `max(limit - preordered_quantity, 0)`, or `null` when
  `preorder_stock_limit` is `null` (no ceiling to report against); always `null` for a variant
  with no configured limit, consistently — never `0` for that case

**Batching**: `stock_context_for_products()` (already the single context-builder both public
views call) now also returns the `preordered_by_variant` batch dict alongside the existing
`stock_by_variant` one, reusing the same already-gathered variant list — one extra query for the
whole page, not one per variant. No changes to `views.py` were needed. Confirmed by temporarily
bypassing the context lookup: query count jumped from 18 to 54 queries as the catalog grew;
restored, it stays flat.

Nothing about checkout, pricing, shipment, or inventory logic changed — this is a pure read
exposure of numbers those flows already compute.

Tests (`apps/catalog/tests/test_api.py`, `apps/catalog/tests/test_public_query_counts.py`): an
active pre-order with committed quantity reports its limit/quantity/remaining correctly; an
unlimited pre-order reports `preorder_remaining: null` (with a real `preordered_quantity`); a
regular variant reports `null`/`0`/`null`; list-endpoint query count stays flat as pre-order
variant count grows (verified to fail — 18→54 queries — without the batch context, confirming
the test actually catches the N+1).

Full suite: 1592 tests green (1588 + 4 new). `ruff`, `mypy` (same one pre-existing unrelated
`api/v1/webhooks` error), `manage.py check` all clean.


## 13. Recent changes (2026-10-03): guest checkout identities

**Rule.** Anonymous `POST /api/v1/public/checkout/` never attaches an order to — or edits — a
registered account because of a typed email or phone. It goes to the **guest identity** for the
normalised phone (`01XXXXXXXXX`): a `User` with `is_guest=True`, no email, an unusable password
(cannot log in or reset), created by `accounts.services.users.get_or_create_guest_customer`. A
partial unique constraint (`user_unique_live_guest_phone`: one live guest per phone) makes
concurrent first checkouts reuse one row. Typed contact details stay on the order
(`contact_email`, `contact_phone`, address snapshot). A signed-in request's order goes to
`request.user`, whose phone and default address are left alone. Guest identities never block a
real owner verifying that number (`phone_verification._assert_phone_available`). The admin user
API exposes `is_guest` read-only (list + detail); nothing writable can change it.

**Legacy limitation — email guest accounts.** Before this change, guest checkout created an
ordinary customer account from the typed email with a random password. Those accounts carry **no
reliable marker**: no source/channel field on users or orders, no audit entry at creation
(registration doesn't log one either), and the password is hashed like any other. Signals such as
"never logged in", "email unverified" or "only guest-style orders" also describe real customers
who registered and never came back, so classifying on them would misclassify. They are therefore
**left unchanged** and treated as registered accounts: new anonymous orders never attach to them,
and their earlier orders stay where they are. Order history from before and after this change is
therefore separate for those people; staff still see every order. Migration `0021_user_is_guest`
converts only accounts with **no email** — which only the short-lived phone-only checkout (0020)
created — into guest identities, normalising their phones and soft-deleting any race duplicates.

## 14. Recent changes (2026-10-04): store policies

**Source of truth.** `apps.business.models.StorePolicy`, one row per kind (`shipping`, `returns`,
`refund`), created empty and unpublished by migration `business/0010`. No policy wording is
seeded. The short-lived `BusinessProfile.shipping_policy` / `return_policy` text fields were never
released and are gone.

**Content** is bilingual and sectioned:
`{"title": {"en","bn"}, "intro": {"en","bn"}, "sections": [{"heading": {...}, "body": {...}}]}`.
Shape and completeness rules live in `apps/business/policy_content.py`.

**Writes** go only through `apps.business.services.policies.update_store_policy` (admin API
`PATCH /api/v1/admin/settings/policies/<kind>/`). The Django admin shows policies and revisions
read-only. Publishing requires every title/heading/body in both locales (an intro, if written, in
both), and an `effective_date` that is not in the future. Changing published terms requires
restating the date, which may not move earlier. Each accepted change writes a
`StorePolicyRevision` (previous/current snapshot, effective date, staff user) plus a
`store_policy.updated` audit entry; no-op and rejected requests write neither.

**Public reads** (`GET /api/v1/public/policies/<kind>/`) return `kind`, `title`, `intro`,
`sections`, `effective_date`; returns adds `returns_enabled` (the `orders.returns` flag) and
`eligibility`. Unpublished or incomplete policies answer 404 `policy_unavailable` — the selector
re-checks completeness, so a row edited around the service still cannot publish blank text.
`effective_date` is the policy's date, never the row's `updated_at`.

**Return eligibility** lives on the `returns` row (`return_window_days`,
`preorder_returns_allowed`, `non_returnable_categories`) and defaults to imposing nothing.
`create_rma` enforces it only while the return policy is published, for every caller, and
per line applies the **version in force when that line was delivered**:
- versions are the published snapshots in `StorePolicyRevision.current` (plus the live row),
  rebuilt in one query by `return_rule_versions()`;
- a version governs from its `effective_date`, inclusive, compared as a calendar date in
  `settings.TIME_ZONE`; on a given date the most recently *published* version whose effective
  date has arrived governs, so a same-day correction replaces the version it corrects;
- a delivery before every published version keeps the legacy behaviour (no policy rules);
  unpublishing the policy withdraws every version;
- the governing moment is the latest `Shipment.delivered_at` among delivered consignments
  carrying the line — the same moment the window runs from — so a split shipment straddling an
  effective date is governed entirely by the later delivery; a line with no recorded delivery
  falls under today's version and has not started its window;
- category matching is exact (no descendant categories); a bundle line uses the bundle's category;
- pre-order exclusion uses `SalesOrderLine.is_preorder`.

**Refunds** remain manual: staff record them with `refund_payment` against a captured `Payment`
(`refunds.approve`). There is no gateway payout, no RMA-to-refund link and no refund timing, so
the backend exposes no refund method or timeline fields; any such promise belongs only in
owner-approved refund policy text.

The storefront's policy pages still render their own hardcoded copy and do not call these
endpoints yet.

## 15. Recent changes (2026-10-07): phone capture on open carts

**Why.** `SalesOrder.contact_phone` used to be written only by a successful guest checkout, so a
shopper who typed a phone and left was listed in admin "Customer Carts" with no number (guest
carts have no customer at all). The phone can now be saved on the still-pending cart. No
migration: the existing `contact_phone` column holds it.

**Endpoints.** Same request and response on both; the cart is chosen by who is calling, never by
an id in the URL or body.

| Caller | Endpoint | Identifies the cart by |
| --- | --- | --- |
| Guest | `PATCH /api/v1/public/cart/contact/` | `X-Guest-Cart-Token` header |
| Signed-in customer | `PATCH /api/v1/customer/orders/cart/contact/` | the access token's user |

(`PUT` works too — `apps.common.middleware` rewrites it to `PATCH`.)

- Request: `{"phone": "01712345678"}` — required, max 32 chars, a Bangladeshi mobile number in any
  form checkout accepts (`01XXXXXXXXX`, `+8801XXXXXXXXX`, `8801XXXXXXXXX`).
- `200`: `{"data": {"contact_phone": "01712345678"}, "message": "Success"}`. The value is stored
  trimmed, otherwise as typed. Calling again replaces it. There is no way to clear it.
- Errors, in the standard `{"error": {"code", "message", "fields"}}` envelope:

| Status | `code` | When |
| --- | --- | --- |
| 400 | `invalid_phone` | not a Bangladeshi mobile number |
| 400 | validation error | `phone` missing, blank or over 32 chars |
| 400 | `guest_cart_token_required` | guest call without the header (a token in the query string does not count) |
| 404 | `guest_cart_not_found` | unknown token, or the cart is deleted, checked out or claimed |
| 404 | `cart_not_found` | the customer has no open cart (none yet, deleted, or already checked out) |
| 401 / 403 | — | customer endpoint without a customer session |

**Rules.** Both views call one service, `apps.orders.services.carts.set_cart_contact_phone`, which
locks the order row, requires it to be pending and not deleted, and validates with
`apps.common.utils.phone.is_bd_mobile`. The guest view first runs the existing `lock_guest_cart`,
so the token and cart state are re-checked under the lock. Nothing but `contact_phone` and
`updated_at` is written: no guest identity is created, and a registered customer's profile phone
is never changed. Saving bumps `updated_at`, so the cart moves to the top of the admin list.

**What happens at checkout.** A guest checkout (`POST /public/checkout/`) overwrites the captured
value with the phone it submits. The signed-in cart checkout (`POST /customer/orders/cart/checkout/`)
takes no phone, so a captured value stays on the order — where, like any `contact_phone`, it is
preferred over the address/profile phone for the admin order view, the courier recipient phone
and risk scoring.

**Admin.** `GET /api/v1/admin/orders/carts/` keeps its fields. `customer_phone` is now the cart's
`contact_phone` when set, else the customer's profile phone, else `null`. A guest cart therefore
shows a phone once captured while `customer_id`, `customer_email` and `customer_name` stay `null`.
`?search=` also matches `contact_phone`. The token and its hash are never returned. Query count is
unchanged (the phone is a column on the row already loaded).

**Frontend work still needed.** The storefront does not call these endpoints yet, so nothing is
captured until it does. It should send the phone once the checkout field holds a valid number
(e.g. on blur), and only for a server-side cart: guest carts kept only in the browser have no
token and no row to save to.
