from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from io import StringIO
from uuid import uuid4

import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.accounting.constants import ACCOUNT_CODES
from apps.accounting.models import Account, JournalEntry
from apps.accounting.selectors.accounts import get_account_by_code
from apps.accounting.selectors.reports import (
    balance_sheet,
    cash_flow,
    inventory_valuation,
    profit_and_loss,
)
from apps.accounting.services.expenses import create_expense
from apps.accounting.services.journal import post_journal_entry, reverse_journal_entry
from apps.accounting.tests.helpers import seed_chart_of_accounts
from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.business.selectors.business_profile import get_business_profile
from apps.catalog.factories import ProductVariantFactory
from apps.inventory.selectors.warehouse import get_or_create_default_warehouse
from apps.inventory.services.stock import write_off_stock
from apps.orders.constants import PaymentMethodKey
from apps.orders.selectors.payments import order_deposit_due
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.payments import capture_payment, record_payment_due, refund_payment
from apps.orders.services.shipments import create_shipment
from apps.orders.tests.test_unpaid_orders import _preorder_variant
from apps.procurement.factories import SupplierFactory
from apps.procurement.models import GRNLine
from apps.procurement.services.goods_receipt import create_goods_receipt
from apps.procurement.services.purchase_orders import create_purchase_order, submit_purchase_order
from apps.procurement.services.vendor_bills import create_vendor_bill, record_vendor_payment

pytestmark = pytest.mark.django_db

STOCK = "stock"
PREORDER = "preorder"
REPORTS = "/api/v1/admin/accounting/reports/"
ENTRIES = "/api/v1/admin/accounting/journal-entries/"


def _window() -> dict:
    return {"start": date.today() - timedelta(days=1), "end": date.today() + timedelta(days=1)}


def _as_of() -> date:
    return date.today() + timedelta(days=1)


def _kinds(reference_type: str) -> set[str]:
    return set(
        JournalEntry.objects.filter(reference_type=reference_type).values_list("kind", flat=True)
    )


def _buy(variant, *, quantity: int, unit_cost: str, pay: bool = True):
    supplier = SupplierFactory(kind=variant.product.category.category_type)
    po = create_purchase_order(
        supplier=supplier,
        order_date=date.today(),
        lines=[{"variant": variant, "quantity_ordered": quantity, "unit_cost": Decimal(unit_cost)}],
    )
    po = submit_purchase_order(purchase_order=po)
    create_goods_receipt(
        purchase_order=po,
        received_date=date.today(),
        received_by=None,
        lines=[
            {
                "purchase_order_line": po.lines.get(),
                "quantity_received": quantity,
                "condition": GRNLine.Condition.ACCEPTED,
            }
        ],
    )
    amount = Decimal(unit_cost) * quantity
    bill = create_vendor_bill(
        purchase_order=po, supplier=supplier, amount=amount, due_date=date.today()
    )
    if pay:
        record_vendor_payment(vendor_bill=bill, amount=amount, paid_at=timezone.now())
    return po


def _stock_sale() -> dict:
    """Buy 10 at 4.00 (paid), sell and ship 3 at 50.00, write 1 off."""
    variant = ProductVariantFactory(price=Decimal("50.00"), product__category__category_type=STOCK)
    _buy(variant, quantity=10, unit_cost="4.00")
    cart = get_or_create_cart(create_user(email=f"stock-{uuid4().hex[:8]}@example.com"))
    add_line(order=cart, variant=variant, quantity=3)
    checkout(order=cart)
    cart.refresh_from_db()
    payment = capture_payment(order=cart, amount=cart.grand_total)
    create_shipment(order=cart, lines=[{"order_line": cart.lines.get(), "quantity": 3}])
    write_off_stock(variant=variant, quantity=1, reason="Damaged")
    return {"variant": variant, "order": cart, "payment": payment}


def _preorder_deposit(percent: str = "30") -> dict:
    """Buy 5 at 100.00 on credit, take a deposit on an order of 2 at 1000.00; nothing ships."""
    profile = get_business_profile()
    profile.preorder_deposit_percent = Decimal(percent)
    profile.save(update_fields=["preorder_deposit_percent"])
    variant = _preorder_variant(price=Decimal("1000.00"))
    _buy(variant, quantity=5, unit_cost="100.00", pay=False)
    order = get_or_create_cart(create_user(email=f"pre-{uuid4().hex[:8]}@example.com"))
    add_line(order=order, variant=variant, quantity=2)
    checkout(order=order)
    order.refresh_from_db()
    record_payment_due(order=order, method=PaymentMethodKey.BKASH)
    deposit = order_deposit_due(order)
    payment = capture_payment(
        order=order, amount=deposit, method=PaymentMethodKey.BKASH, reference=f"TRX-{uuid4().hex}"
    )
    return {"variant": variant, "order": order, "deposit": deposit, "payment": payment}


def _expense(amount: str = "75.00"):
    return create_expense(
        expense_date=date.today(),
        payee="Landlord",
        amount=Decimal(amount),
        expense_account=get_account_by_code(ACCOUNT_CODES["general_expense"]),
        payment_account=get_account_by_code(ACCOUNT_CODES["bank"]),
    )


@pytest.fixture
def books(settings):
    seed_chart_of_accounts()
    get_or_create_default_warehouse(PREORDER)
    stock = _stock_sale()
    preorder = _preorder_deposit()
    expense = _expense()
    return {"stock": stock, "preorder": preorder, "expense": expense}


@pytest.fixture
def admin_client(api_client):
    api_client.force_authenticate(
        user=create_user(email="journal-kind-admin@example.com", role=UserRole.ADMIN)
    )
    return api_client


def test_every_posting_takes_the_kind_of_its_source_document(books):
    for reference_type in (
        "goods_receipt_line",
        "vendor_bill",
        "customer_payment",
    ):
        assert _kinds(reference_type) == {STOCK, PREORDER}, reference_type
    for reference_type in (
        "vendor_payment",
        "shipment_revenue",
        "shipment_cogs",
        "stock_writeoff",
    ):
        assert _kinds(reference_type) == {STOCK}, reference_type
    assert _kinds("expense") == {""}

    preorder_payment = JournalEntry.objects.get(reference_id=books["preorder"]["payment"].id)
    assert preorder_payment.kind == PREORDER


def test_refund_and_reversal_keep_the_kind(books):
    refund_payment(payment=books["preorder"]["payment"], amount=Decimal("10.00"))
    assert _kinds("customer_refund") == {PREORDER}

    entry = JournalEntry.objects.get(reference_id=books["stock"]["payment"].id)
    assert reverse_journal_entry(entry).kind == STOCK


def test_profit_and_loss_per_kind_leaves_company_expenses_out(books):
    stock = profit_and_loss(**_window(), kind=STOCK)
    preorder = profit_and_loss(**_window(), kind=PREORDER)
    company = profit_and_loss(**_window())

    assert stock["revenue"] == books["stock"]["order"].grand_total
    assert stock["cost_of_goods_sold"] == Decimal("12.00")
    assert stock["gross_profit"] == stock["revenue"] - Decimal("12.00")
    assert stock["other_costs"] == Decimal("4.00")
    assert stock["company_wide_left_out"] == ["operating_expenses", "net_income"]
    assert "operating_expenses" not in stock
    assert "net_income" not in stock

    assert company["operating_expenses"] == Decimal("79.00")
    assert company["revenue"] == stock["revenue"] + preorder["revenue"]
    assert company["unassigned_revenue"] == Decimal("0")
    assert company["unassigned_cost_of_goods_sold"] == Decimal("0")


def test_a_preorder_deposit_is_money_held_not_sales(books):
    deposit = books["preorder"]["deposit"]
    assert deposit > 0

    report = profit_and_loss(**_window(), kind=PREORDER)
    assert report["revenue"] == Decimal("0")
    assert report["gross_profit"] == Decimal("0")

    sheet = balance_sheet(as_of=_as_of(), kind=PREORDER)
    assert sheet["customer_balance"] == -deposit
    assert sheet["accounts_payable"] == Decimal("500.00")
    assert cash_flow(**_window(), kind=PREORDER)["customer_receipts"] == deposit


def test_balance_sheet_per_kind_matches_stock_on_hand_and_leaves_cash_out(books):
    for kind in (STOCK, PREORDER):
        sheet = balance_sheet(as_of=_as_of(), kind=kind)
        assert sheet["inventory_asset"] == inventory_valuation(kind=kind)
        assert sheet["company_wide_left_out"] == [
            "cash",
            "tax_payable",
            "equity",
            "retained_earnings",
        ]
        assert "assets" not in sheet
        assert "equity" not in sheet

    stock = balance_sheet(as_of=_as_of(), kind=STOCK)
    assert stock["inventory_asset"] == Decimal("24.00")
    assert stock["customer_balance"] == Decimal("0")
    assert stock["accounts_payable"] == Decimal("0")
    whole = balance_sheet(as_of=_as_of())
    assert whole["assets"] - (whole["liabilities"] + whole["equity"]) == Decimal("0")


def test_cash_flow_per_kind_splits_customers_and_suppliers_only(books):
    refund_payment(payment=books["stock"]["payment"], amount=Decimal("5.00"))
    stock = cash_flow(**_window(), kind=STOCK)
    preorder = cash_flow(**_window(), kind=PREORDER)
    company = cash_flow(**_window())

    assert stock["customer_receipts"] == books["stock"]["order"].grand_total
    assert stock["customer_refunds"] == Decimal("5.00")
    assert stock["supplier_payments"] == Decimal("40.00")
    assert stock["other"] == Decimal("0")
    assert stock["net_change_in_cash"] == stock["customer_receipts"] - Decimal("45.00")
    assert preorder["supplier_payments"] == Decimal("0")
    assert company["company_wide"] == Decimal("-75.00")
    assert company["net_change_in_cash"] == (
        stock["net_change_in_cash"] + preorder["net_change_in_cash"] + company["company_wide"]
    )


def test_backfill_is_a_dry_run_until_apply(books):
    expected = dict(JournalEntry.objects.values_list("id", "kind"))
    orphan = post_journal_entry(
        entry_date=date.today(),
        reference_type="customer_payment",
        reference_id=uuid4(),
        lines=[
            {"account": get_account_by_code(ACCOUNT_CODES["bank"]), "debit": Decimal("1")},
            {
                "account": get_account_by_code(ACCOUNT_CODES["accounts_receivable"]),
                "credit": Decimal("1"),
            },
        ],
    )
    JournalEntry.objects.update(kind="")

    out = StringIO()
    call_command("backfill_journal_kind", stdout=out)
    assert "Dry run" in out.getvalue()
    assert "customer_payment: would mark 1 as preorder" in out.getvalue()
    assert not JournalEntry.objects.exclude(kind="").exists()

    out = StringIO()
    call_command("backfill_journal_kind", "--apply", stdout=out)
    assert dict(JournalEntry.objects.exclude(id=orphan.id).values_list("id", "kind")) == expected
    orphan.refresh_from_db()
    assert orphan.kind == ""
    assert "customer_payment: 1 left company-wide, source document not found" in out.getvalue()
    assert JournalEntry.objects.get(reference_type="expense").kind == ""

    out = StringIO()
    call_command("backfill_journal_kind", "--apply", stdout=out)
    assert "Marked 0 journal entries." in out.getvalue()


def test_backfill_leaves_entries_that_already_have_a_kind(books):
    entry = JournalEntry.objects.get(reference_id=books["stock"]["payment"].id)
    JournalEntry.objects.filter(id=entry.id).update(kind=PREORDER)

    call_command("backfill_journal_kind", "--apply", stdout=StringIO())

    entry.refresh_from_db()
    assert entry.kind == PREORDER


def test_reports_api_takes_kind(admin_client, books):
    window = {key: value.isoformat() for key, value in _window().items()}

    pnl = admin_client.get(f"{REPORTS}profit-and-loss/", {**window, "kind": STOCK})
    assert pnl.status_code == 200
    assert pnl.data["data"]["kind"] == STOCK
    assert pnl.data["data"]["company_wide_left_out"] == ["operating_expenses", "net_income"]

    sheet = admin_client.get(
        f"{REPORTS}balance-sheet/", {"as_of": _as_of().isoformat(), "kind": PREORDER}
    )
    assert sheet.status_code == 200
    assert sheet.data["data"]["customer_balance"] == -books["preorder"]["deposit"]

    cash = admin_client.get(f"{REPORTS}cash-flow/", {**window, "kind": PREORDER})
    assert cash.status_code == 200
    assert cash.data["data"]["customer_receipts"] == books["preorder"]["deposit"]

    whole = admin_client.get(f"{REPORTS}profit-and-loss/", window)
    assert "net_income" in whole.data["data"]
    assert "kind" not in whole.data["data"]

    csv = admin_client.get(
        f"{REPORTS}profit-and-loss/", {**window, "kind": STOCK, "file_format": "csv"}
    )
    assert csv.status_code == 200
    assert "company_wide_left_out" in csv.content.decode()

    for path, params in (
        ("profit-and-loss/", window),
        ("cash-flow/", window),
        ("balance-sheet/", {"as_of": _as_of().isoformat()}),
    ):
        assert admin_client.get(f"{REPORTS}{path}", {**params, "kind": "both"}).status_code == 400


def test_inventory_valuation_api_checks_the_ledger_per_kind(admin_client, books):
    for kind, value in ((STOCK, Decimal("24.00")), (PREORDER, Decimal("500.00"))):
        data = admin_client.get(f"{REPORTS}inventory-valuation/", {"kind": kind}).data["data"]
        assert data["inventory_value"] == value
        assert data["ledger_inventory_asset"] == value
        assert data["ledger_difference"] == Decimal("0")

    whole = admin_client.get(f"{REPORTS}inventory-valuation/").data["data"]
    assert set(whole) == {"inventory_value"}


def test_journal_entry_list_filters_by_kind(admin_client, books):
    def kinds(**params) -> set[str]:
        response = admin_client.get(ENTRIES, {"page_size": 100, **params})
        assert response.status_code == 200, response.data
        return {row["kind"] for row in response.data["data"]["results"]}

    assert kinds() == {STOCK, PREORDER, ""}
    assert kinds(kind=STOCK) == {STOCK}
    assert kinds(kind=PREORDER) == {PREORDER}
    assert kinds(kind="company") == {""}
    assert admin_client.get(ENTRIES, {"kind": "both"}).status_code == 400


def test_manual_journal_entry_can_be_given_a_kind(admin_client):
    debit = Account.objects.create(code="9700", name="Test asset", type=Account.Type.ASSET)
    credit = Account.objects.create(code="9701", name="Test owed", type=Account.Type.LIABILITY)
    payload = {
        "entry_date": date.today().isoformat(),
        "description": "Manual",
        "lines": [
            {"account_id": str(debit.id), "debit": "10.00"},
            {"account_id": str(credit.id), "credit": "10.00"},
        ],
    }

    tagged = admin_client.post(ENTRIES, {**payload, "kind": PREORDER}, format="json")
    plain = admin_client.post(ENTRIES, payload, format="json")
    wrong = admin_client.post(ENTRIES, {**payload, "kind": "both"}, format="json")

    assert tagged.status_code == 201
    assert tagged.data["data"]["kind"] == PREORDER
    assert plain.data["data"]["kind"] == ""
    assert wrong.status_code == 400
