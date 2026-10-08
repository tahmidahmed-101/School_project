from __future__ import annotations

from decimal import Decimal

from django.utils import timezone

from apps.accounting.constants import ACCOUNT_CODES
from apps.accounting.models import Account, JournalEntry
from apps.accounting.selectors.accounts import get_account_by_code
from apps.accounting.services.journal import post_journal_entry, reverse_journal_entry
from apps.accounting.services.money import quantize_money
from apps.catalog.selectors.bundles import expand_variant
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.models import StockItem
from apps.inventory.selectors.stock import get_stock_item
from apps.orders.models import SalesOrder


def _account(key: str) -> Account:
    account = get_account_by_code(ACCOUNT_CODES[key])
    if account is None:
        raise BusinessRuleViolationError(
            f"Chart of accounts is missing account {ACCOUNT_CODES[key]} ({key}). "
            "Run `manage.py seed_chart_of_accounts` first.",
            code="missing_account",
        )
    return account


def post_goods_received(grn_line) -> JournalEntry:
    """Dr Inventory Asset / Cr GRNI — stock is in the building, bill hasn't
    arrived yet."""
    po_line = grn_line.purchase_order_line
    # unit_cost is stored at 4dp; the journal columns are 2dp. Round here so
    # both sides of the entry carry the identical stored value.
    amount = quantize_money(po_line.unit_cost * grn_line.quantity_received)
    return post_journal_entry(
        entry_date=grn_line.goods_receipt.received_date,
        reference_type="goods_receipt_line",
        reference_id=grn_line.id,
        description=f"Goods received: variant {po_line.variant_id}",
        lines=[
            {"account": _account("inventory_asset"), "debit": amount, "credit": Decimal("0")},
            {"account": _account("grni"), "debit": Decimal("0"), "credit": amount},
        ],
    )


def post_vendor_bill(bill) -> JournalEntry:
    """Dr GRNI / Cr Accounts Payable — clears the accrual, recognizes the
    real liability."""
    return post_journal_entry(
        entry_date=bill.due_date,
        reference_type="vendor_bill",
        reference_id=bill.id,
        description=f"Vendor bill {bill.bill_number}",
        lines=[
            {"account": _account("grni"), "debit": bill.amount, "credit": Decimal("0")},
            {"account": _account("accounts_payable"), "debit": Decimal("0"), "credit": bill.amount},
        ],
    )


def post_vendor_payment(payment) -> JournalEntry:
    return post_journal_entry(
        entry_date=payment.paid_at.date(),
        reference_type="vendor_payment",
        reference_id=payment.id,
        description=f"Payment on {payment.vendor_bill.bill_number}",
        lines=[
            {
                "account": _account("accounts_payable"),
                "debit": payment.amount,
                "credit": Decimal("0"),
            },
            {"account": _account("bank"), "debit": Decimal("0"), "credit": payment.amount},
        ],
    )


def post_sales_shipment(shipment) -> list[JournalEntry]:
    """Two entries, matching blueprint §8's revenue side and cost side:
    Dr AR / Cr Revenue+Tax, and Dr COGS / Cr Inventory Asset (COGS valued
    at each variant's current weighted-average cost)."""
    lines = list(
        shipment.lines.select_related("order_line", "order_line__variant").prefetch_related(
            "order_line__variant__bundle_components__component_variant"
        )
    )

    # Expand every line's components up front so the per-variant cost lookup
    # below is one batched query, not one per bundle component per line.
    expansions = [
        (line.order_line, component, component_qty)
        for line in lines
        for component, component_qty in expand_variant(line.order_line.variant, line.quantity)
    ]
    variant_ids = {component.id for _, component, _ in expansions}
    cost_by_variant = {
        item.variant_id: item.avg_cost
        for item in StockItem.objects.filter(variant_id__in=variant_ids)
    }

    # An order-level coupon discounts the whole order, not any one line, so
    # shipment revenue recognizes the same proportion of it as post_sales_return
    # reverses — otherwise a discounted order would recognize more revenue
    # than the customer was ever actually charged.
    order = shipment.order
    discount_ratio = order.discount_total / order.subtotal if order.subtotal else Decimal("0")

    revenue_total = Decimal("0")
    tax_total = Decimal("0")
    cogs_total = Decimal("0")

    for line in lines:
        order_line = line.order_line
        line_revenue = order_line.unit_price * line.quantity
        line_revenue -= line_revenue * discount_ratio
        revenue_total += quantize_money(line_revenue)
        if order_line.quantity:
            # Quantize the shipped share of line tax before summing: the AR
            # debit below is revenue + tax, and it has to equal the two credits
            # exactly once every figure is stored at 2dp.
            tax_total += quantize_money(order_line.tax_amount * line.quantity / order_line.quantity)
    for _order_line, component, component_qty in expansions:
        avg_cost = cost_by_variant.get(component.id, Decimal("0"))
        cogs_total += avg_cost * component_qty
    cogs_total = quantize_money(cogs_total)

    entry_date = shipment.shipped_at.date() if shipment.shipped_at else timezone.now().date()

    # capture_payment credits AR for grand_total (incl. shipping); include it
    # here too. Shipping is recognized once per order, on whichever shipment
    # completes it — using the order's own shipping_total (the amount the
    # customer was actually charged at checkout), not shipment.shipping_charge
    # (an optional, per-shipment admin field that defaults to 0 and would
    # otherwise silently drop shipping revenue whenever it's left unset).
    # A consignment received back had its revenue, shipping included, reversed,
    # so it no longer counts as having recognised shipping.
    recognize_shipping = (
        order.status == SalesOrder.Status.SHIPPED
        and not order.shipments.exclude(pk=shipment.pk)
        .filter(includes_shipping_revenue=True, received_back_at__isnull=True)
        .exists()
    )
    if recognize_shipping:
        revenue_total += order.shipping_total
    revenue_entry = post_journal_entry(
        entry_date=entry_date,
        reference_type="shipment_revenue",
        reference_id=shipment.id,
        description=f"Shipment revenue for {shipment.order.order_number}",
        lines=[
            {
                "account": _account("accounts_receivable"),
                "debit": revenue_total + tax_total,
                "credit": Decimal("0"),
            },
            {"account": _account("revenue"), "debit": Decimal("0"), "credit": revenue_total},
            {"account": _account("tax_payable"), "debit": Decimal("0"), "credit": tax_total},
        ],
    )
    cogs_entry = post_journal_entry(
        entry_date=entry_date,
        reference_type="shipment_cogs",
        reference_id=shipment.id,
        description=f"COGS for {shipment.order.order_number}",
        lines=[
            {"account": _account("cogs"), "debit": cogs_total, "credit": Decimal("0")},
            {"account": _account("inventory_asset"), "debit": Decimal("0"), "credit": cogs_total},
        ],
    )
    if recognize_shipping:
        type(shipment).objects.filter(pk=shipment.pk).update(includes_shipping_revenue=True)
        shipment.includes_shipping_revenue = True
    return [revenue_entry, cogs_entry]


def reverse_sales_shipment(shipment) -> list[JournalEntry]:
    """Undo `post_sales_shipment` for a consignment received back undelivered:
    the contra of exactly what was posted (revenue, tax, any shipping, and COGS
    at the cost charged then), never a recomputation at today's figures."""
    entries = JournalEntry.objects.filter(
        reference_type__in=("shipment_revenue", "shipment_cogs"),
        reference_id=shipment.id,
        reverses__isnull=True,
        status=JournalEntry.Status.POSTED,
        deleted_at__isnull=True,
    ).order_by("created_at")
    return [reverse_journal_entry(entry, reason="consignment received back") for entry in entries]


def post_sales_return(rma) -> list[JournalEntry]:
    """The mirror of `post_sales_shipment`, posted when an approved RMA is
    physically received. Without it, a return puts stock back on the shelf
    while revenue, tax and COGS stay on the books from the original
    shipment — the balance sheet never comes back into line.

    Revenue side: Dr Sales Returns + Dr Tax Payable / Cr Accounts Receivable.
    Cost side: Cr COGS, debited to Inventory Asset for units graded sellable
    (they rejoin stock) and to Inventory Shrinkage for units graded damaged
    (they are scrapped, so the cost becomes a loss rather than an asset).
    """
    rma_lines = list(
        rma.lines.select_related("order_line", "order_line__variant").prefetch_related(
            "order_line__variant__bundle_components__component_variant"
        )
    )

    # An order-level coupon discounts the whole order, not any one line, so
    # a return reverses the same proportion of it as the revenue it's
    # reversing — otherwise a discounted order's returns would credit back
    # more than the customer was ever actually charged or that was
    # originally recognized as revenue.
    order = rma.order
    discount_ratio = order.discount_total / order.subtotal if order.subtotal else Decimal("0")

    revenue_total = Decimal("0")
    tax_total = Decimal("0")
    for line in rma_lines:
        order_line = line.order_line
        line_revenue = order_line.unit_price * line.quantity
        line_revenue -= line_revenue * discount_ratio
        revenue_total += quantize_money(line_revenue)
        if order_line.quantity:
            tax_total += quantize_money(order_line.tax_amount * line.quantity / order_line.quantity)

    # Cost is split by grade, so expand bundles the same way the shipment did.
    expansions = [
        (line, component, component_qty)
        for line in rma_lines
        for component, component_qty in expand_variant(line.order_line.variant, line.quantity)
    ]
    variant_ids = {component.id for _, component, _ in expansions}
    cost_by_variant = {
        item.variant_id: item.avg_cost
        for item in StockItem.objects.filter(variant_id__in=variant_ids)
    }

    restocked_cost = Decimal("0")
    scrapped_cost = Decimal("0")
    for line, component, component_qty in expansions:
        avg_cost = cost_by_variant.get(component.id, Decimal("0"))
        amount = avg_cost * component_qty
        if line.condition == type(line).Condition.SELLABLE:
            restocked_cost += amount
        else:
            scrapped_cost += amount
    restocked_cost = quantize_money(restocked_cost)
    scrapped_cost = quantize_money(scrapped_cost)

    entry_date = timezone.now().date()
    entries = []

    revenue_lines = [
        {"account": _account("sales_returns"), "debit": revenue_total, "credit": Decimal("0")},
    ]
    if tax_total:
        revenue_lines.append(
            {"account": _account("tax_payable"), "debit": tax_total, "credit": Decimal("0")}
        )
    revenue_lines.append(
        {
            "account": _account("accounts_receivable"),
            "debit": Decimal("0"),
            "credit": revenue_total + tax_total,
        }
    )
    entries.append(
        post_journal_entry(
            entry_date=entry_date,
            reference_type="rma_revenue_reversal",
            reference_id=rma.id,
            description=f"Sales return {rma.rma_number}",
            lines=revenue_lines,
        )
    )

    cogs_credit = restocked_cost + scrapped_cost
    if cogs_credit:
        cost_lines = []
        if restocked_cost:
            cost_lines.append(
                {
                    "account": _account("inventory_asset"),
                    "debit": restocked_cost,
                    "credit": Decimal("0"),
                }
            )
        if scrapped_cost:
            cost_lines.append(
                {
                    "account": _account("inventory_shrinkage"),
                    "debit": scrapped_cost,
                    "credit": Decimal("0"),
                }
            )
        cost_lines.append(
            {"account": _account("cogs"), "debit": Decimal("0"), "credit": cogs_credit}
        )
        entries.append(
            post_journal_entry(
                entry_date=entry_date,
                reference_type="rma_cogs_reversal",
                reference_id=rma.id,
                description=f"COGS reversal for return {rma.rma_number}",
                lines=cost_lines,
            )
        )
    return entries


def post_customer_payment(payment, *, entry_date=None) -> JournalEntry:
    return post_journal_entry(
        entry_date=entry_date or payment.created_at.date(),
        reference_type="customer_payment",
        reference_id=payment.id,
        description=f"Payment for {payment.order.order_number}",
        lines=[
            {"account": _account("bank"), "debit": payment.amount, "credit": Decimal("0")},
            {
                "account": _account("accounts_receivable"),
                "debit": Decimal("0"),
                "credit": payment.amount,
            },
        ],
    )


def post_customer_refund(payment, *, amount: Decimal | None = None) -> JournalEntry:
    """Dr Refund Payable / Cr Bank — recognizes the refund obligation before
    the money leaves, matching blueprint §8's "Customer refund issued" row.

    `amount` is the value of this individual refund, which for a partial
    refund is less than the payment total; it defaults to the full payment.
    """
    amount = quantize_money(payment.amount if amount is None else amount)
    return post_journal_entry(
        entry_date=timezone.now().date(),
        reference_type="customer_refund",
        reference_id=payment.id,
        description=f"Refund for {payment.order.order_number}",
        lines=[
            {
                "account": _account("refund_payable"),
                "debit": amount,
                "credit": Decimal("0"),
            },
            {"account": _account("bank"), "debit": Decimal("0"), "credit": amount},
        ],
    )


def post_stock_adjustment(ledger_entry, *, unit_cost: Decimal | None = None) -> JournalEntry:
    """Cycle-count correction, the two-directional sibling of
    `post_stock_writeoff`: an adjustment out is Dr Inventory Shrinkage / Cr
    Inventory Asset, an adjustment in is the exact mirror (a recovery of
    previously written-off cost), so GL inventory tracks physical valuation.

    `unit_cost` is the cost the movement was received at; without one the
    variant's current weighted-average cost values the adjustment.
    """
    is_increase = ledger_entry.movement_type == MovementType.ADJUSTMENT_IN
    stock_item = get_stock_item(variant=ledger_entry.variant)
    # An outward movement never touches avg_cost, so it is valued at the
    # current weighted average rather than any caller-supplied cost.
    if unit_cost is None or not is_increase:
        unit_cost = stock_item.avg_cost if stock_item else Decimal("0")
    amount = quantize_money(unit_cost * ledger_entry.quantity)

    inventory = _account("inventory_asset")
    shrinkage = _account("inventory_shrinkage")
    debit_account, credit_account = (
        (inventory, shrinkage) if is_increase else (shrinkage, inventory)
    )
    return post_journal_entry(
        entry_date=ledger_entry.created_at.date(),
        reference_type="stock_adjustment",
        reference_id=ledger_entry.id,
        description=f"Stock adjustment: variant {ledger_entry.variant_id}",
        lines=[
            {"account": debit_account, "debit": amount, "credit": Decimal("0")},
            {"account": credit_account, "debit": Decimal("0"), "credit": amount},
        ],
    )


def post_stock_writeoff(ledger_entry) -> JournalEntry:
    """Dr Inventory Shrinkage Expense / Cr Inventory Asset. Valued at the
    variant's avg_cost at the time of write-off (record_movement doesn't
    change avg_cost on an OUT movement, so the current StockItem value is
    the value at write-off time)."""
    stock_item = get_stock_item(variant=ledger_entry.variant)
    unit_cost = stock_item.avg_cost if stock_item else Decimal("0")
    amount = quantize_money(unit_cost * ledger_entry.quantity)
    return post_journal_entry(
        entry_date=ledger_entry.created_at.date(),
        reference_type="stock_writeoff",
        reference_id=ledger_entry.id,
        description=f"Write-off: variant {ledger_entry.variant_id}",
        lines=[
            {"account": _account("inventory_shrinkage"), "debit": amount, "credit": Decimal("0")},
            {"account": _account("inventory_asset"), "debit": Decimal("0"), "credit": amount},
        ],
    )
