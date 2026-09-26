from __future__ import annotations

from decimal import Decimal

import factory
from django.utils import timezone

from apps.accounting.models import (
    Account,
    Expense,
    ExpenseCategory,
    JournalEntry,
    JournalEntryLine,
    TaxRate,
)


class AccountFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Account
        django_get_or_create = ("code",)

    code = factory.Sequence(lambda n: f"9{n:03d}")
    name = factory.Sequence(lambda n: f"Account {n}")
    type = Account.Type.ASSET
    parent = None


class JournalEntryFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = JournalEntry

    entry_date = factory.LazyFunction(lambda: timezone.now().date())
    reference_type = ""
    reference_id = None
    status = JournalEntry.Status.POSTED
    description = ""


class JournalEntryLineFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = JournalEntryLine

    journal_entry = factory.SubFactory(JournalEntryFactory)
    account = factory.SubFactory(AccountFactory)
    debit = Decimal("0")
    credit = Decimal("0")


class ExpenseCategoryFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ExpenseCategory

    name = factory.Sequence(lambda n: f"Category {n}")
    description = ""
    expense_account = factory.SubFactory(AccountFactory, type=Account.Type.EXPENSE)


class ExpenseFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Expense

    expense_date = factory.LazyFunction(lambda: timezone.now().date())
    payee = factory.Sequence(lambda n: f"Payee {n}")
    description = ""
    amount = Decimal("100.00")
    expense_account = factory.SubFactory(AccountFactory, type=Account.Type.EXPENSE)
    category = None
    payment_account = factory.SubFactory(AccountFactory, type=Account.Type.ASSET)
    reference_number = ""
    journal_entry = None


class TaxRateFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = TaxRate

    name = factory.Sequence(lambda n: f"Tax Rate {n}")
    rate_percent = Decimal("8.00")
    region = ""
