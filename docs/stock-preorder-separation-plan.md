# Stock and pre-order: full separation in the dashboard

Owner request, 2026-10-09: a stock item must show nothing about pre-order, a pre-order must show nothing about
stock items. Audit found 26 dashboard screens mixed. This is a change request on top of
`docs/preorder-stock-fix-plan.md`.

## Decisions (owner said "go", defaults apply)

1. Coupons work on stock orders only.
2. Pre-order stock left over after every pre-order is served stays in the pre-order area. A "move to shop stock"
   action is not part of this plan.
3. Reports show pre-order sales and deposits apart from stock sales.
4. All 23 pre-order stages stay until the owner sends a shorter list.

## What does not change

Database tables are shared (`ProductVariant`, `StockItem`, `SalesOrder`, `Payment`, `Shipment`, `ReturnRMA`).
Splitting them would mean rewriting orders, stock and accounting. The server refuses cross-over and every list
is asked for one kind; the screens are separate.

The kind of a product is its category's `category_type` (`stock` or `preorder`). The kind of an order is
`SalesOrder.order_type`.

## API contract (admin API, `/api/v1/admin/`)

Existing and kept:

- `orders/?order_type=stock|preorder`
- `catalog/products/?category_type=`, `catalog/variants/?category_type=`, `catalog/categories/?category_type=`

New: every list below takes `kind=stock|preorder` and returns only that kind. Without `kind` it behaves as today.

- carts, payments, returns (RMA), shipments: by the order's `order_type`
- inventory stock list, stock ledger, reservations, low-stock: by the variant's category kind
- catalog reviews, questions, price reports: by the product's category kind
- reporting (dashboard, sales trend, top products, category breakdown, stock turnover): by kind; the dashboard
  answer also carries a `preorder` block (open orders, deposits held, balances outstanding) when no kind is given

Each row of payments, shipments, returns and carts carries `order_type` so a detail page knows where its
"back" link goes.

## Server rules (M1)

- A variant in a stock category: `is_preorder_enabled` false and every pre-order field empty. Refused with
  `preorder_category_required` (exists) on save.
- A variant in a pre-order category: no `discount_price`, no `wholesale_price`; its stock rows carry no reorder
  point or target level. Refused with `stock_field_on_preorder`.
- A bundle takes stock components only (`bundle_stock_only`).
- A coupon cannot be applied to a basket holding a pre-order line, and is dropped at checkout of a pre-order
  (`coupon_stock_only`).
- A category's kind cannot change while it has products (`category_kind_in_use`).
- `manage.py fix_product_kind_mismatches` (dry run by default, `--apply` to write): clears pre-order fields from
  variants in stock categories and stock-only fields from variants in pre-order categories. Never run on
  production without a backup and the owner's go-ahead.

## Dashboard (admin app)

Two halves. A page of one half renders no field, column, filter or badge of the other.

Menu "Pre-orders" (`features/preorder/`):

| Page | Route | Content |
|---|---|---|
| Orders | `/preorders` | pre-order orders, book on top |
| Products | `/preorder_products` | pre-order products |
| Categories | `/preorder_categories` | pre-order categories |
| Arrivals | `/preorder_arrivals` | received stock of pre-order items, allocate, what to buy |
| Payments | `/preorder_payments` | deposits and balances |
| Shipments | `/preorder_shipments` | |
| Returns | `/preorder_returns` | |
| Carts | `/preorder_carts` | carts holding a pre-order line |
| Goods movements | `/preorder_movements` | ledger of pre-order goods |
| Reviews, Questions, Price reports | `/preorder_reviews`, `/preorder_questions`, `/preorder_price_reports` | feedback on pre-order products |
| Settings | `/preorder_settings` | deposit percent, pre-order slides, pre-order promo lines |

Stock half keeps its menus (Catalog, Sales, Logistics, Inventory) and shows stock only.

Forms:

- Stock product form and variant dialog: no pre-order field at all.
- Pre-order product form and variant dialog: name, category (pre-order categories only), brand, description,
  images, variants (colour, size, SKU, price, cost, weight), open and close dates, release date, optional
  pre-order price, limit. No discount price, wholesale price, barcode, reorder point, stock count.
- Category form: no type dropdown; the page it is opened from sets the kind.
- Hero slides and promo lines: the stock Settings page edits placement `home`, the pre-order Settings page
  edits placement `preorder`; `both` is no longer accepted.

## Phases

- M1 server rules, kind filters, reporting split, fix command
- M2 catalog pages and forms per kind
- M3 pre-order section: orders side (payments, shipments, returns) and arrivals
- M4 stock section shows stock only
- M5 home, reports, settings

## As built (2026-10-09)

- Purchasing is split (owner: "no shared anything"): a purchase order holds one kind (`purchase_kind_mismatch`);
  purchase orders, goods receipts, vendor bills and vendor payments take `kind` and carry `kind` on each row.
  Pre-order pages live under `/preorder_purchasing/*`. A bill with no purchase order counts as stock.
- Phase N (owner: "fix the rest and deep dive"): brands and suppliers carry a `kind` (name unique per kind;
  `brand_kind_mismatch`, `supplier_kind_mismatch`); journal entries carry a `kind` and profit and loss, balance
  sheet and cash flow take `kind` (expenses, cash, tax and equity stay company-wide and are named in the answer);
  customers, fraud cases, analytics and the home page are one page per half; slides and promo lines are `home` or
  `preorder`, never both.
- Kind always comes from the category. A pre-order item outside its ordering window cannot be bought
  (`preorder_closed`); it is never sold as a stock item. Low stock, coupons, bundles, barcode, discount and
  wholesale are stock only; inventory writes refuse the other kind (`stock_kind_mismatch`).
- Storefront: one kind per cart, wishlist in two sections, search in two groups, order history in two tabs,
  pre-order tracking shows pre-order stages only, no coupon on a pre-order checkout.
- Company-wide on purpose: staff and roles, audit log, tax rates, chart of accounts, expenses, business profile,
  integrations, media, policy texts, customer accounts, courier accounts (carriers). Delivery zones and rates and
  payment methods are one set per half; warehouses: see "Delivery, payment and warehouse set-up" below.
- Data commands, all dry run by default: `fix_product_kind_mismatches`, `split_shared_suppliers_and_brands`,
  `split_both_placements`, `backfill_journal_kind`, `split_shared_delivery_and_payment_setup`.
- Staff-created orders are stock only (`order_kind_mismatch`); a staff-made pre-order needs a deposit step first.
- `kind` also on `inventory/stock-status/`, `reporting/low-stock/`, `accounting/reports/inventory-valuation/`,
  the ledger export; variants export takes `category_type`; variants import refuses pre-order rows.

## Delivery, payment and warehouse set-up: what the code does per kind (2026-10-09)

Delivery zones, rates and payment methods are split per half. The warehouse rows are as the code stood before any split.

| Area | Stock | Pre-order | Where |
| --- | --- | --- | --- |
| Delivery charge | Stock zone matched on the address text, stock rate by weight and carrier | Pre-order zone and pre-order rate only; no fallback to stock (`no_shipping_zone`, `no_shipping_rate`) | `backend/apps/orders/services/checkout.py`, `backend/apps/logistics/services/rates.py`, `selectors/rates.py` |
| Zones, rates | Own zones (name unique per kind) and rates (one per zone, carrier and kind) | Own zones and rates | `backend/apps/logistics/models/shipping_zone.py`, `shipping_rate.py` |
| Carriers | One list for the company: a carrier is the courier account (credentials, webhook address by carrier id) | The same list; whether and at what price a half uses a carrier is set by that half's rates | `backend/apps/logistics/models/carrier.py`, `backend/api/v1/webhooks/couriers/views.py` |
| Payment methods offered | Methods switched on for stock, with stock pay-to numbers | Methods switched on for pre-order, with pre-order pay-to numbers; checkout checks the method against the order's own kind | `backend/apps/orders/selectors/payment_methods.py`, `backend/apps/orders/services/payments.py`, `backend/api/v1/public/business/views.py` |
| Amount due at checkout | Whole order total | `preorder_deposit_percent` of the total | `backend/apps/orders/selectors/payments.py:29-35` |
| Cash on delivery | Order is confirmed at once | Stays "awaiting payment" until the deposit is recorded, when the deposit is above zero | `backend/apps/orders/services/payments.py:77-84` |
| Coupon | Applied | Dropped | `backend/apps/orders/services/checkout.py:62-64` |
| Stock at checkout | Reserved from the default warehouse | Nothing reserved; set aside later by "allocate" | `backend/apps/orders/services/checkout.py:136-140`, `backend/apps/orders/services/preorder_allocation.py:17-74` |

- The only rule that differs by kind and has a setting is the deposit percent. It already has its page: `/preorder_settings`.
- Delivery: `kind` on `ShippingZone` and `ShippingRate`; a rate always has its zone's kind (`rate_kind_mismatch`).
  Admin `logistics/zones/` and `logistics/rates/` take `kind`; pages `/shipping_zones`, `/shipping_rates` and
  `/preorder_shipping_zones`, `/preorder_shipping_rates`. The storefront quote reads the kind from the basket lines.
- Payment methods: one on/off and one pay-to number per method per kind. `settings/payment-methods/` (admin) and
  `/payment-methods/` (public) take `kind`, default stock. Pre-order switches are on `/preorder_settings`.
- Deploy: after `migrate`, run `manage.py split_shared_delivery_and_payment_setup` (dry run), then `--apply`. It gives
  the pre-order half a copy of every stock zone, rate and payment method row. Until it runs, a pre-order checkout
  is refused with `no_shipping_zone` and pre-order payment methods are all on with empty pay-to numbers.
- `TODO(ask)`: carriers stay one list. Should a courier account ever be switched off for one half only? Today that is
  done by removing that half's rates for the carrier.
- `TODO(ask)`: should arrived pre-order goods sit in their own warehouse?

Warehouses today:

- A warehouse has no kind (`backend/apps/inventory/models/warehouse.py:10-17`). Stock is one row per variant per
  warehouse (`stock_item.py:46-53`), and a variant is one kind through its category, so the two halves never share
  a row but do share a warehouse.
- Goods receipts pass no warehouse, so every receipt of either kind lands in the default warehouse
  (`backend/apps/procurement/services/goods_receipt.py:61-69`, `backend/apps/inventory/services/stock.py:19-27`).
- Checkout, staff orders and shipments reserve and ship from the default warehouse only (no `warehouse=` passed:
  `checkout.py:140`, `orders.py:268,342`, `shipments.py:120-121,316,481`).
- Pre-order allocation reads and reserves only the default warehouse (`preorder_allocation.py:25,41-45,53`). Stock
  moved to another warehouse is not seen by allocation or by checkout.
- A separate pre-order warehouse would need: a kind (or a "pre-order default") on `Warehouse`, goods receipts choosing
  the warehouse by the purchase order's kind, and allocation and shipping using it.

## Out of scope

Separate tables, a "move to shop stock" action, trimming the stage list.
