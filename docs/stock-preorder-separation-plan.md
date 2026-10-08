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
  edits placement `preorder`; `both` is shown on each as "also on the other shop" until edited.

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
- Still one list for both halves: suppliers, brands, customers, warehouses, carriers / zones / rates,
  payment methods, staff, and the ledger reports below.
- Profit and loss, balance sheet and cash flow are not split: journal lines carry no kind.
- Staff-created orders are stock only (`order_kind_mismatch`); a staff-made pre-order needs a deposit step first.
- `kind` also on `inventory/stock-status/`, `reporting/low-stock/`, `accounting/reports/inventory-valuation/`,
  the ledger export; variants export takes `category_type`; variants import refuses pre-order rows.

## Out of scope

Separate tables, a "move to shop stock" action, trimming the stage list, storefront changes.
