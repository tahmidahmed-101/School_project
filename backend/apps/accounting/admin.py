from __future__ import annotations

from typing import ClassVar

from django.contrib import admin
from django.db.models import Sum

from apps.accounts.constants import StaffPermissionCode
from apps.common.admin import StaffPermissionAdminMixin

from .models import Account, Expense, ExpenseCategory, JournalEntry, JournalEntryLine, TaxRate


class JournalEntryLineInline(admin.TabularInline):
    model = JournalEntryLine
    extra = 0
    fields = ("account", "debit", "credit")
    autocomplete_fields = ("account",)


@admin.register(Account)
class AccountAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.ACCOUNTING_VIEW
    manage_permission_code = StaffPermissionCode.ACCOUNTING_POST
    list_display = ("code", "name", "type", "parent", "is_active")
    list_filter = ("type", "is_active")
    search_fields = ("code", "name")
    autocomplete_fields = ("parent",)


@admin.register(JournalEntry)
class JournalEntryAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.ACCOUNTING_VIEW
    manage_permission_code = StaffPermissionCode.ACCOUNTING_POST
    date_hierarchy = "entry_date"
    list_display = ("id", "entry_date", "reference_type", "status", "is_balanced")
    list_filter = ("status", "reference_type")
    search_fields = ("reference_type", "description")
    inlines: ClassVar[list] = [JournalEntryLineInline]

    @admin.display(boolean=True, description="Balanced")
    def is_balanced(self, obj: JournalEntry) -> bool:
        totals = obj.lines.aggregate(d=Sum("debit"), c=Sum("credit"))
        return (totals["d"] or 0) == (totals["c"] or 0)

    def has_change_permission(self, request, obj=None) -> bool:
        # posted entries are immutable — reverse with a new entry, don't edit history
        if obj and obj.status == JournalEntry.Status.POSTED:
            return False
        return super().has_change_permission(request, obj)


@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.ACCOUNTING_VIEW
    manage_permission_code = StaffPermissionCode.ACCOUNTING_POST
    list_display = ("name", "expense_account", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "description")
    autocomplete_fields = ("expense_account",)


@admin.register(Expense)
class ExpenseAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.ACCOUNTING_VIEW
    manage_permission_code = StaffPermissionCode.ACCOUNTING_POST
    date_hierarchy = "expense_date"
    list_display = (
        "expense_date",
        "payee",
        "category",
        "expense_account",
        "payment_account",
        "amount",
        "reference_number",
    )
    list_filter = ("expense_account", "category")
    search_fields = ("payee", "description", "reference_number")
    autocomplete_fields = ("expense_account", "category", "payment_account", "journal_entry")

    def has_change_permission(self, request, obj=None) -> bool:
        # ledger-backed once posted, matches journal entry immutability
        if obj and obj.journal_entry_id:
            return False
        return super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None) -> bool:
        return False


@admin.register(TaxRate)
class TaxRateAdmin(StaffPermissionAdminMixin, admin.ModelAdmin):
    view_permission_code = StaffPermissionCode.ACCOUNTING_VIEW
    manage_permission_code = StaffPermissionCode.ACCOUNTING_POST
    list_display = ("name", "rate_percent", "region", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "region")
