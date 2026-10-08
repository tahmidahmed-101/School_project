# Stock vs pre-order: fix plan

Written 2026-10-08 after a read-only audit of how the two product kinds are handled from catalogue to
refund. Nothing in this plan is built yet. Every phase after Phase 0 is a change request and needs the
owner's answer to the decisions listed under it.

## 1. What the code does today (verified by reading the lines cited)

| # | Fact | Where |
|---|---|---|
| V1 | "Pre-order" is a flag plus a date window on the **variant**. The category has its own `category_type`; nothing links the two. | `backend/apps/catalog/models/variant.py:77-84`, `models/category.py:16-34` |
| V2 | Pre-order price wins over a lower discount price while the window is open. | `variant.py:99-113` |
| V3 | One cart, one order for a mixed basket. Pre-order is a flag per order line. One shipping fee on total weight. | `backend/apps/orders/services/checkout.py:92-123` |
| V4 | Pre-order lines reserve no stock at checkout and post no stock-out at shipment. | `checkout.py:102-103`, `services/shipments.py:111-124` |
| V5 | Storefront checkout records a **captured payment for the full total at once**, COD included, and the order becomes confirmed. | `services/guest_checkout.py:186`, `services/payments.py:94-107` |
| V6 | A payment must equal the full order total and the order must be awaiting payment: no deposit, no second payment. | `payments.py:60-72` |
| V7 | The shipment dialog sets cash-to-collect to 0 whenever a captured payment exists (so for every storefront COD order) and pre-fills full quantity for every line, pre-order lines included. | `frontend/admin/src/features/sales/components/order/CreateShipmentDialog.tsx:21-23` |
| V8 | The pre-order limit counts open carts (status pending) and all placed orders, for the life of the variant. | `services/carts.py:105-119, 144-163` |
| V9 | A returned unit graded sellable is added to stock for every line, pre-order lines too, although their shipment never took stock out. | `services/returns.py:250-262` |
| V10 | Cancel takes no order lock, is allowed on a confirmed order whatever has shipped, never refunds, and ignores the pre-order stage. | `services/orders.py:45-71` |
| V11 | The manual status override checks only "unknown", "already cancelled" and "delivered needs shipments". | `services/orders.py:138-182` |
| V12 | A logged-in customer can capture the payment on their own order with a self-typed reference. | `backend/api/v1/customer/orders/views.py:363-384` |

Reported by the audit, **not yet re-verified** (each gets a failing test before its fix):
double-count of a logged-in buyer's own cart against the limit; no re-pricing at checkout; variant cannot be
bought after its window ends even with stock; invoice "Paid in full" for unpaid COD and wrong figures after a
refund (`services/invoice_document.py`); Refund Payable only ever debited and advances booked as negative
receivable (`backend/apps/accounting/services/postings.py`); dashboard revenue at order date vs ledger revenue
at shipment; reservation sweeper expiring paid orders; storefront leaks (home shelves, related products,
search, counts, sticky shop type, wishlist); admin shows three different meanings of "pre-order".

## 2. Target model (recommended)

1. **A product is one kind.** All its variants are stock or all are pre-order, and the kind matches its
   category's type. Enforced in the backend on save.
2. **An order is one kind.** `SalesOrder.order_type` = `stock` or `preorder`. A basket with both kinds
   cannot be checked out as one order.
3. **Payment is a ledger of receipts, not a switch.** An order has `paid_total` and `balance_due`. COD is
   money owed until the courier hands it over. A pre-order can carry a deposit.
4. **Pre-order goods are real stock once they arrive.** Arrival allocates units to the waiting orders;
   shipping deducts them, exactly like a stock line.
5. **The stage belongs to a pre-order order** (which, after point 2, never contains stock lines).

## 3. Phases

Size: S = a day or less of focused work, M = a few days, L = a week or more. These are relative, not quotes.

### Phase 0: stop the bleeding (size M, backend + admin, no owner decision except D0)

Built 2026-10-08 on branch `fix/preorder-phase-0`, with D0 taken as "from deploy date only". Three things
differ from the table below:

- 0.1 covers every storefront method, not only COD. A storefront order stores a pending payment row with
  the chosen method. COD is confirmed at once; any other method waits in "awaiting payment" until staff
  capture it with a reference.
- 0.6 keeps "closed" available from confirmed and shipped, and "delivered" from confirmed when delivered
  consignments already cover every line, because staff use both today.
- 0.8 does not stop the checkout. A saved cart is charged at today's price, which is the price the
  storefront shows, the same as a checkout sent as an item list.

| Item | Change | Files |
|---|---|---|
| 0.1 | COD checkout confirms the order **without** creating a payment. Payment is recorded when cash is received (existing admin "record payment" action, allowed on a confirmed COD order). | `services/guest_checkout.py`, `services/payments.py`, `accounting/services/postings.py` (no posting at COD order time) |
| 0.2 | Shipment dialog: cash-to-collect defaults to total minus money actually received; pre-order lines default to quantity 0. | `CreateShipmentDialog.tsx` |
| 0.3 | Invoice: "paid" = received minus refunded across all payments; never "Paid in full" with a balance. | `services/invoice_document.py`, `templates/pdf/invoice.html` |
| 0.4 | Customer self-capture endpoint removed (storefront does not call it). | `api/v1/customer/orders/views.py`, urls, tests |
| 0.5 | Cancel: take the order lock; refuse once any unit has shipped. | `services/orders.py` |
| 0.6 | Status override: explicit transition table; no jump back to an open cart; no skip over payment or shipment. | `services/orders.py`, admin `OrderDetail.tsx` options |
| 0.7 | Pre-order limit counts placed orders only (not open carts); staff quantity edits run the same limit check. | `services/carts.py`, `services/orders.py` |
| 0.8 | Checkout re-prices every line from the variant; if a price changed since it was added, checkout stops and the storefront shows the new price. | `services/checkout.py`, `services/guest_checkout.py`, storefront checkout error handling |
| 0.9 | Admin can see the kind: `is_preorder` on each order line, a pre-order badge on the order list, a "has pre-order" filter. | `api/v1/admin/orders/serializers.py`, `selectors/sales_orders.py`, admin `Orders.tsx`, `OrderLinesCard.tsx` |

- Migration: none expected.
- Tests: one failing test per item first, in `backend/apps/orders/tests/`; admin typecheck.
- **D0 (owner):** existing live COD orders already carry a fake captured payment and a bank posting. Options:
  leave history as it is and apply the new rule from the deploy date (recommended, no data touched), or
  correct history with a reviewed data migration. Correcting history changes ledger entries on production
  and will not be done without explicit approval and a database backup.

### Phase 1: one kind per product, no leaks between the two shops (size M, no money logic)

Partly built 2026-10-08 on branch `fix/preorder-phase-1`, with D6 and D9 taken at their recommended defaults.
Built: lowest-price rule; ended window sells from stock; `kind` and `is_preorder_upcoming` on the public
product API; related products stay in one shop; storefront shops split by kind with "not open yet" and
"closed" labels; promo line placement; the report command (`manage.py report_product_kind_mismatches`).
Not built: the save-time validation (waits for the owner to fix what the report lists), the admin's single
definition of pre-order, pre-order fallback hero slides, the cart quantity cap. Search, wishlist and the
"shop type sticks" claim were not re-verified. Until the data is fixed the storefront also keeps a product
that is taking pre-orders in the pre-order shop even when its category is a stock one.

- Backend validation: pre-order on requires start and end dates; all variants of a product share the kind;
  product kind matches category type; changing a category's type is refused while it holds products.
  Public product API gains a `kind` field and a `kind` filter; related products, counts and bundles respect it.
- Storefront: stock home shows only stock-category shelves; closed and upcoming pre-orders get their own
  state instead of "Out of stock"; related products, search results, wishlist, breadcrumb and the offers
  tile follow the product's kind; shop type no longer sticks between visits; quantity cap applied in the
  cart, not only on the product page.
- Dashboard content: promo lines get the same Home / Pre-order / Both placement hero slides have; the
  pre-order page gets its own built-in fallback slides.
- Admin: one definition of "pre-order" on product list, variant list and product detail; mismatch warning.
- Migration: promo line `placement`; a **report-only** command listing products whose variants or category
  disagree, for the owner to fix by hand before validation is switched on.
- New Bangla strings (closed / opens on …): written with the bangla-copy skill.
- **Decisions:** D6 (what happens when the window ends), D9 (which price wins).

### Phase 2: one kind per order (size M)

- `SalesOrder.order_type`, set at checkout from the lines; back-filled for existing orders
  (`mixed` kept as a third value for historic orders only).
- Cart: recommended rule is that a basket holds one kind; adding the other kind asks the customer to
  finish the current basket first. Alternative: split a mixed basket into two orders at checkout, each with
  its own delivery fee. Both need D2.
- Pre-order stage allowed only on pre-order orders; terminal stages kept in step with order status.
- Admin order list: type column and filter; orders CSV gains type, stage, payment method, paid, balance.
- Order-success and track-order pages: kind-specific text with the expected date and a tracking link.
- Migration: yes (`order_type` + back-fill). API deploys first.
- **Decisions:** D2 (mixed basket), D8 (separate delivery charge for pre-order).

### Phase 3: payments, deposits, invoices, refunds (size L, touches accounting)

- Several payments per order; `paid_total`, `balance_due`; order confirmation rule per kind (D1).
- COD lifecycle: owed → collected → remitted by courier (D7).
- Customer-deposit liability account for money taken before dispatch; one definition of revenue shared by
  dashboard and P&L; Refund Payable credited by a return or cancellation and cleared by the refund.
- Refund suggested from the return or cancellation and linked to it; cancellation cut-off by stage (D3).
- Invoice record with its own number and issue date; deposit receipt; balance shown.
- Line edits after checkout recompute coupon, shipping and balance.
- All amounts through the shared money module (`Decimal`, rounded once); no new float arithmetic.
- Migration: yes. Ledger changes are reviewed with whoever keeps the books before deploy.
- **Decisions:** D1, D3, D7, D10.

### Phase 4: pre-order stock (size L)

- Arrival step: received goods are allocated to waiting pre-order lines (a reservation, like stock lines).
- A pre-order line cannot ship until it holds a reservation; shipping posts the stock-out and real cost.
- Returns and received-back parcels use one rule for both kinds.
- Demand view: units owed per variant from open pre-orders, to drive purchase orders.
- Migration: yes.
- **Decisions:** D4 (bought per customer or in bulk), D5 (limit per batch or lifetime).

### Phase 5: communication and reports (size M, optional)

- Customer messages on key stages. SMS needs an outside provider: a recurring cost and a new integration,
  so it needs approval and a provider choice first. No new long-running service is required.
- Stage sequence per route (air / sea); stage notes shown to the customer.
- Reports: open pre-order book, deposits held, balances outstanding, orders past their promised date.

## 4. Decisions for the owner

| # | Question | Recommended default |
|---|---|---|
| D0 | Fix historic COD "paid" records, or apply the new rule from deploy date only? | From deploy date only |
| D1 | Pre-order payment: full advance, deposit (how much), or COD allowed? | TODO(ask) |
| D2 | Basket with both kinds: block, or split into two orders? | Block, with a clear message |
| D3 | Until which stage may a customer cancel a pre-order; what happens to the deposit? | TODO(ask) |
| D4 | Pre-order goods bought per customer, or in bulk and then allocated? | TODO(ask) |
| D5 | Pre-order limit per batch/window or lifetime? | Per window; open carts do not hold a slot |
| D6 | When the window ends or goods arrive: sell as a stock item automatically? At which price? | Yes, at the normal price, once stock is on hand |
| D7 | COD counts as paid on delivery or on courier payout? | On courier payout |
| D8 | Separate air/sea delivery charge for pre-order? | TODO(ask) |
| D9 | Both a discount price and a pre-order price set: which wins? | The lower one |
| D10 | Sequential invoice number needed for tax? One invoice per order or per delivery? | TODO(ask) |

## 5. Rules for every phase

- One branch per phase; a failing test first for each bug; only the touched test files while coding; the
  full backend suite once before merge.
- Backend migration means the API deploys before storefront and admin.
- No change to production data without a backup and the owner's explicit go-ahead.
- No new long-running service in any phase as planned.
