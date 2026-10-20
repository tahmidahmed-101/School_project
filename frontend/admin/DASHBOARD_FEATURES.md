# Kull-Mart Admin Dashboard — Feature List

Source: frontend/admin/src + backend/api/v1/admin (verified against code, 2026-10-20)

## Modules

- Platform: login, roles, permissions, navigation
- Dashboard and analytics
- Catalog: products, variants, bundles, categories, brands
- Product feedback: reviews, Q&A, price reports
- Inventory: stock, ledger, transfers, reservations, warehouses
- Pre-order: arrivals, allocation, deposits, stages
- Purchasing: suppliers, purchase orders, receiving, bills
- Orders, payments and returns
- Shipping: shipments, couriers, zones, rates
- Marketing: sales, coupons, popups, subscribers
- Risk: fraud cases and blocklists
- Accounting: expenses, ledger, tax, financial reports
- Customers, staff and audit
- Settings and storefront content

## Module detail

### Platform — login, roles, permissions, navigation

- Staff login with secure session refresh and cross-tab logout
- Forgot password: reset with a 6-digit code sent by email
- Roles: admin, staff, customer; ~25 staff permission codes
- Read-only views for staff without write permission
- Stock shop / Pre-order shop switcher in the sidebar
- Global search (Ctrl+K) across pages, orders, products, customers
- Notification bell for pending work; dark/light mode

### Dashboard and analytics

- KPI cards: revenue, orders, stock turnover, low stock
- Date presets and custom range with previous-period comparison
- Revenue chart, top products, recent orders, fulfilment status
- Sales trend, category breakdown, customer segments
- Separate pre-order overview: open book, deposits, balances

### Catalog — products, variants, bundles, categories, brands

- Products per shop with search, filters, sort, bulk actions, CSV import
- Variants generated from attributes (size, colour…), each with SKU, barcode, price
- Image gallery with reorder, alt text and per-option images
- Pre-order window, release date, pre-order price, min/max quantity
- Bundles built from component variants (stock limited by scarcest part)
- Category tree, brands, shop-wide attributes
- Soft delete with restore; delete blocked while stock is held

### Product feedback — reviews, Q&A, price reports

- Reviews: publish, hide (with a staff-only reason) or delete; filter by status and rating
- Optional approval: new reviews wait for staff before they show
- Answer and publish customer questions
- Triage "wrong price" reports: resolve, dismiss, reopen
- Q&A and price reports switchable per product

### Inventory — stock, ledger, transfers, reservations, warehouses

- Stock per variant per warehouse: on hand, reserved, available
- Adjustments, bulk adjustments, write-offs (all post to accounting)
- Append-only stock ledger with filters and CSV export
- Stock in every active warehouse sells: orders hold it where it is (default warehouse first), and shipping, returns and cancellations use that same warehouse
- Stock transfers between warehouses of the same shop
- Reservations list with expiry and manual release; expired holds are freed at checkout
- Warehouses with one default per shop; empty warehouses can be deleted
- Weighted-average cost tracking

### Pre-order — arrivals, allocation, deposits, stages

- "To buy" report: waiting, arrived, still to buy
- Receive pre-order goods and set aside for oldest orders first
- Deposit percentage and balance tracking per order
- Pre-order stage tracking with history
- Pre-order terms shown at checkout

### Purchasing — suppliers, purchase orders, receiving, bills

- Suppliers per shop with CSV import
- Purchase orders: draft → submitted → received, with PDF
- Goods receiving into a chosen warehouse, with accepted / rejected lines
- Vendor bills with 3-way match against received goods; each delivery is billed once, part deliveries are billed in parts
- Partial vendor payments with CSV export

### Orders, payments and returns

- Order list with search, filters, date range, CSV export
- Manual / phone orders for existing customers
- Order workspace: edit lines, capture payment, ship, cancel, invoice PDF
- Manual status change (confirm / ship / deliver / close) with the stock and accounting steps each one runs
- Payments ledger with full or partial refunds
- Returns (RMA): approve, reject, grade sellable/damaged, receive
- Abandoned carts view (read-only)

### Shipping — shipments, couriers, zones, rates

- Shipments with forward-only status updates
- Receive back returned parcels; replace damaged units
- Book parcels with the courier from the dashboard (once per parcel)
- Couriers: Pathao, Steadfast, RedX, manual; signed status webhooks
- Delivery zones and weight-based rates per zone and courier
- Free-delivery threshold (stock orders)

### Marketing — sales, coupons, popups, subscribers

- Scheduled percentage sales on all / categories / brands / products
- Coupons: % or fixed, caps, min order, usage and per-customer limits
- Image promotion popups per shop with priority, schedule and link
- Newsletter subscribers with CSV import/export

### Risk — fraud cases and blocklists

- Automatic risk score on each order; high risk opens a case
- Telegram alert to staff; high-risk orders held from shipping
- Resolve fraud cases with outcome and notes
- Phone and IP blocklists with CSV import; "advance payment only" numbers cannot use cash on delivery

### Accounting — expenses, ledger, tax, financial reports

- Expenses by category, posted automatically, with CSV import/export
- Deleting an expense posts a reversing entry; restoring posts it again
- Chart of accounts and double-entry journal (manual entries and reversals)
- Automatic postings from sales, purchases, payments, stock and returns
- Tax rates with one default
- Profit & loss, balance sheet, cash flow, inventory valuation
- Per-shop and company-wide views; CSV download

### Customers, staff and audit

- Customer list and profile: orders, addresses, role, password reset
- Staff accounts with per-permission editor
- Own profile: avatar, password, Telegram link
- Audit log with CSV export; login history

### Settings and storefront content

- Business profile: name, logo, contacts, address, currency, social links
- Hero slides and promo lines (English / Bangla)
- Module and feature on/off switches
- Payment methods per shop: Cash, COD, Card, bKash, Nagad, bank
- Shipping, returns and refund policies with publish and revision history
- Pre-order settings: deposit %, returns, terms

## Tech stack

| Layer | Tech |
|---|---|
| Admin dashboard | React 19, Vite, TypeScript, Redux Toolkit, Tailwind CSS |
| Storefront | Next.js 16, React 19, Tailwind CSS |
| Backend/API | Django, Django REST Framework, Python |
| Database | PostgreSQL 16 |
| Integrations | Pathao / Steadfast / RedX, Telegram bot, Twilio SMS |
| Hosting | Docker, Caddy |

> **Known gaps** — found in code, not working yet:
>
> - No online payment gateway (payments are recorded manually)
> - Email sending is not configured for production (SMTP), so password reset codes are not delivered there yet
> - Missing: email campaigns
