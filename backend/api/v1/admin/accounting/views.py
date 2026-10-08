from __future__ import annotations

from typing import ClassVar

from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounting.models import Account, JournalEntry
from apps.accounting.selectors.accounts import accounts_list, get_account_by_id
from apps.accounting.selectors.expense_categories import (
    expense_categories_list,
    get_expense_category_by_id,
)
from apps.accounting.selectors.expenses import expenses_list, get_expense_by_id
from apps.accounting.selectors.journal_entries import get_journal_entry_by_id, journal_entries_list
from apps.accounting.selectors.reports import (
    balance_sheet,
    cash_flow,
    inventory_valuation,
    profit_and_loss,
)
from apps.accounting.selectors.tax_rates import get_tax_rate_by_id, tax_rates_list
from apps.accounting.services.accounts import (
    create_account,
    create_tax_rate,
    delete_account,
    delete_tax_rate,
    update_account,
    update_tax_rate,
)
from apps.accounting.services.expense_categories import (
    create_expense_category,
    delete_expense_category,
    update_expense_category,
)
from apps.accounting.services.expenses import create_expense, delete_expense, update_expense
from apps.accounting.services.exports import (
    REPORT_COLUMNS,
    balance_sheet_rows,
    cash_flow_rows,
    profit_and_loss_rows,
)
from apps.accounting.services.journal import post_journal_entry, reverse_journal_entry
from apps.accounts.constants import StaffPermissionCode
from apps.common.exceptions import BusinessRuleViolationError, DomainError
from apps.common.generics import GenericListAPIView, IncludeDeletedMixin, RestoreAPIView
from apps.common.params import get_choice, get_date, get_kind, get_uuid, validate_date_range
from apps.common.permissions import require_any_staff_permission, require_staff_permission
from apps.common.responses import error_from_exception, not_found
from apps.common.serializers import DateRangeSerializer
from apps.common.utils.export import CsvRenderer, csv_response

from .serializers import (
    AccountCreateSerializer,
    AccountSerializer,
    AccountUpdateSerializer,
    AsOfSerializer,
    ExpenseCategoryCreateSerializer,
    ExpenseCategorySerializer,
    ExpenseCategoryUpdateSerializer,
    ExpenseCreateSerializer,
    ExpenseSerializer,
    ExpenseUpdateSerializer,
    JournalEntryCreateSerializer,
    JournalEntryReverseSerializer,
    JournalEntrySerializer,
    TaxRateCreateSerializer,
    TaxRateSerializer,
    TaxRateUpdateSerializer,
)

AccountingViewPermission = require_any_staff_permission(
    StaffPermissionCode.ACCOUNTING_VIEW, StaffPermissionCode.ACCOUNTING_POST
)
AccountingPostPermission = require_staff_permission(StaffPermissionCode.ACCOUNTING_POST)


class AccountingPermissionMixin:
    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [AccountingViewPermission()]
        return [AccountingPostPermission()]


@extend_schema(tags=["Accounting"])
class AdminAccountListCreateView(
    IncludeDeletedMixin, AccountingPermissionMixin, GenericListAPIView
):
    include_deleted_permission = AccountingPostPermission
    serializer_class = AccountSerializer
    search_fields = ("code", "name")
    ordering_fields = ("code",)
    default_ordering = "code"

    def get_queryset(self):
        type_param = get_choice(self.request.query_params, "type", Account.Type.values)
        return accounts_list(type=type_param, include_deleted=self.include_deleted())

    def get(self, request) -> Response:
        return self.list_response(request)

    def post(self, request) -> Response:
        payload = {k: v for k, v in request.data.items() if not (k == "parent_id" and v == "")}
        serializer = AccountCreateSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        parent = None
        parent_id = data.pop("parent_id", None)
        if parent_id:
            parent = get_account_by_id(parent_id)
            if parent is None:
                return error_from_exception(
                    DomainError("Parent account not found.", code="parent_not_found")
                )

        account = create_account(parent=parent, **data)
        return Response(
            {"data": AccountSerializer(account).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Accounting"])
class AdminAccountDetailView(AccountingPermissionMixin, APIView):
    serializer_class = AccountSerializer

    def get(self, request, account_id) -> Response:
        account = get_account_by_id(account_id)
        if account is None:
            return not_found("account_not_found", "Account not found.")
        return Response({"data": AccountSerializer(account).data, "message": "Success"})

    def patch(self, request, account_id) -> Response:
        account = get_account_by_id(account_id)
        if account is None:
            return not_found("account_not_found", "Account not found.")
        payload = {k: v for k, v in request.data.items() if not (k == "parent_id" and v == "")}
        serializer = AccountUpdateSerializer(data=payload, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        if "parent_id" in data:
            parent_id = data.pop("parent_id")
            if parent_id:
                parent = get_account_by_id(parent_id)
                if parent is None:
                    return error_from_exception(
                        DomainError("Parent account not found.", code="parent_not_found")
                    )
                data["parent"] = parent
            else:
                data["parent"] = None

        account = update_account(account=account, data=data)
        return Response({"data": AccountSerializer(account).data, "message": "Success"})

    def delete(self, request, account_id) -> Response:
        account = get_account_by_id(account_id)
        if account is None:
            return not_found("account_not_found", "Account not found.")
        delete_account(account=account, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["Accounting"])
class AdminAccountRestoreView(RestoreAPIView):
    permission_classes: ClassVar[list] = [AccountingPostPermission]
    get_object_fn = staticmethod(get_account_by_id)
    serializer_class = AccountSerializer
    not_found_code = "account_not_found"
    not_found_message = "Account not found."


@extend_schema(tags=["Accounting"])
class AdminJournalEntryListView(AccountingPermissionMixin, GenericListAPIView):
    serializer_class = JournalEntrySerializer
    search_fields = ("description", "reference_type")
    ordering_fields = ("entry_date",)
    default_ordering = "-entry_date"

    def get_queryset(self):
        status_param = get_choice(self.request.query_params, "status", JournalEntry.Status.values)
        reference_type = self.request.query_params.get("reference_type")
        return journal_entries_list(status=status_param, reference_type=reference_type)

    def get(self, request) -> Response:
        return self.list_response(request)

    def post(self, request) -> Response:
        serializer = JournalEntryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        raw_lines = data.pop("lines")
        accounts = {
            str(account.id): account
            for account in accounts_list().filter(id__in=[line["account_id"] for line in raw_lines])
        }
        lines = []
        for line in raw_lines:
            account = accounts.get(str(line["account_id"]))
            if account is None:
                return error_from_exception(
                    DomainError("Account not found.", code="account_not_found")
                )
            lines.append({"account": account, "debit": line["debit"], "credit": line["credit"]})

        try:
            entry = post_journal_entry(lines=lines, **data)
        except BusinessRuleViolationError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": JournalEntrySerializer(entry).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Accounting"])
class AdminJournalEntryDetailView(APIView):
    serializer_class = JournalEntrySerializer
    permission_classes: ClassVar[list] = [AccountingViewPermission]

    def get(self, request, entry_id) -> Response:
        entry = get_journal_entry_by_id(entry_id)
        if entry is None:
            return not_found("journal_entry_not_found", "Journal entry not found.")
        return Response({"data": JournalEntrySerializer(entry).data, "message": "Success"})


@extend_schema(tags=["Accounting"])
class AdminJournalEntryReverseView(APIView):
    serializer_class = JournalEntryReverseSerializer
    permission_classes: ClassVar[list] = [AccountingPostPermission]

    def post(self, request, entry_id) -> Response:
        entry = get_journal_entry_by_id(entry_id)
        if entry is None:
            return not_found("journal_entry_not_found", "Journal entry not found.")
        serializer = JournalEntryReverseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            reversal = reverse_journal_entry(entry, **serializer.validated_data)
        except BusinessRuleViolationError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": JournalEntrySerializer(reversal).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


class ExpenseQuerysetMixin(IncludeDeletedMixin):
    """Filters shared by the expense list and its CSV export."""

    include_deleted_permission = AccountingPostPermission
    search_fields = ("payee", "description", "reference_number")
    ordering_fields = ("expense_date", "amount")
    default_ordering = "-expense_date"

    def get_queryset(self):
        params = self.request.query_params
        category_id = get_uuid(params, "category_id")
        account_id = get_uuid(params, "account_id")
        start = get_date(params, "start")
        end = get_date(params, "end")
        validate_date_range(start, end)
        return expenses_list(
            category_id=category_id,
            account_id=account_id,
            start=start,
            end=end,
            include_deleted=self.include_deleted(),
        )


@extend_schema(tags=["Accounting"])
class AdminExpenseListCreateView(
    ExpenseQuerysetMixin, AccountingPermissionMixin, GenericListAPIView
):
    serializer_class = ExpenseSerializer

    def get(self, request) -> Response:
        return self.list_response(request)

    def post(self, request) -> Response:
        serializer = ExpenseCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        expense_account = None
        expense_account_id = data.pop("expense_account_id", None)
        if expense_account_id is not None:
            expense_account = get_account_by_id(expense_account_id)
            if expense_account is None or expense_account.type != Account.Type.EXPENSE:
                return error_from_exception(
                    DomainError("Expense account not found.", code="expense_account_not_found")
                )
        category = None
        category_id = data.pop("category_id", None)
        if category_id is not None:
            category = get_expense_category_by_id(category_id)
            if category is None:
                return error_from_exception(
                    DomainError("Expense category not found.", code="expense_category_not_found")
                )
        payment_account = get_account_by_id(data.pop("payment_account_id"))
        if payment_account is None:
            return error_from_exception(
                DomainError("Payment account not found.", code="payment_account_not_found")
            )

        try:
            expense = create_expense(
                expense_account=expense_account,
                category=category,
                payment_account=payment_account,
                **data,
            )
        except BusinessRuleViolationError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": ExpenseSerializer(expense).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


EXPENSE_EXPORT_COLUMNS = (
    "expense_date",
    "payee",
    "description",
    "category",
    "expense_account",
    "payment_account",
    "amount",
    "reference_number",
)


@extend_schema(tags=["Accounting"])
class AdminExpenseExportView(ExpenseQuerysetMixin, AccountingPermissionMixin, GenericListAPIView):
    serializer_class = ExpenseSerializer
    renderer_classes: ClassVar[list] = [JSONRenderer, CsvRenderer]

    @extend_schema(request=None, responses={(200, "text/csv"): OpenApiTypes.BINARY})
    def get(self, request) -> HttpResponse:
        expenses = self.get_filtered_queryset(request).select_related(
            "category", "expense_account", "payment_account"
        )
        rows = (
            [
                expense.expense_date,
                expense.payee,
                expense.description,
                expense.category.name if expense.category else "",
                expense.expense_account.name,
                expense.payment_account.name,
                expense.amount,
                expense.reference_number,
            ]
            for expense in expenses
        )
        return csv_response("expenses.csv", EXPENSE_EXPORT_COLUMNS, rows)


@extend_schema(tags=["Accounting"])
class AdminExpenseDetailView(AccountingPermissionMixin, APIView):
    serializer_class = ExpenseSerializer

    def get(self, request, expense_id) -> Response:
        expense = get_expense_by_id(expense_id)
        if expense is None:
            return not_found("expense_not_found", "Expense not found.")
        return Response({"data": ExpenseSerializer(expense).data, "message": "Success"})

    def patch(self, request, expense_id) -> Response:
        expense = get_expense_by_id(expense_id)
        if expense is None:
            return not_found("expense_not_found", "Expense not found.")
        serializer = ExpenseUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        expense = update_expense(expense=expense, data=dict(serializer.validated_data))
        return Response({"data": ExpenseSerializer(expense).data, "message": "Success"})

    def delete(self, request, expense_id) -> Response:
        expense = get_expense_by_id(expense_id)
        if expense is None:
            return not_found("expense_not_found", "Expense not found.")
        delete_expense(expense=expense, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["Accounting"])
class AdminExpenseRestoreView(RestoreAPIView):
    permission_classes: ClassVar[list] = [AccountingPostPermission]
    get_object_fn = staticmethod(get_expense_by_id)
    serializer_class = ExpenseSerializer
    not_found_code = "expense_not_found"
    not_found_message = "Expense not found."


@extend_schema(tags=["Accounting"])
class AdminExpenseCategoryListCreateView(
    IncludeDeletedMixin, AccountingPermissionMixin, GenericListAPIView
):
    include_deleted_permission = AccountingPostPermission
    serializer_class = ExpenseCategorySerializer
    search_fields = ("name", "description")
    ordering_fields = ("name",)
    default_ordering = "name"

    def get_queryset(self):
        return expense_categories_list(include_deleted=self.include_deleted())

    def get(self, request) -> Response:
        return self.list_response(request)

    def post(self, request) -> Response:
        serializer = ExpenseCategoryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        expense_account = None
        expense_account_id = data.pop("expense_account_id", None)
        if expense_account_id is not None:
            expense_account = get_account_by_id(expense_account_id)
            if expense_account is None or expense_account.type != Account.Type.EXPENSE:
                return error_from_exception(
                    DomainError("Expense account not found.", code="expense_account_not_found")
                )
        try:
            category = create_expense_category(expense_account=expense_account, **data)
        except BusinessRuleViolationError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": ExpenseCategorySerializer(category).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Accounting"])
class AdminExpenseCategoryDetailView(AccountingPermissionMixin, APIView):
    serializer_class = ExpenseCategorySerializer

    def get(self, request, category_id) -> Response:
        category = get_expense_category_by_id(category_id)
        if category is None:
            return not_found("expense_category_not_found", "Expense category not found.")
        return Response({"data": ExpenseCategorySerializer(category).data, "message": "Success"})

    def patch(self, request, category_id) -> Response:
        category = get_expense_category_by_id(category_id)
        if category is None:
            return not_found("expense_category_not_found", "Expense category not found.")
        serializer = ExpenseCategoryUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        if "expense_account_id" in data:
            expense_account = get_account_by_id(data.pop("expense_account_id"))
            if expense_account is None or expense_account.type != Account.Type.EXPENSE:
                return error_from_exception(
                    DomainError("Expense account not found.", code="expense_account_not_found")
                )
            data["expense_account"] = expense_account
        try:
            category = update_expense_category(category=category, data=data)
        except BusinessRuleViolationError as exc:
            return error_from_exception(exc)
        return Response({"data": ExpenseCategorySerializer(category).data, "message": "Success"})

    def delete(self, request, category_id) -> Response:
        category = get_expense_category_by_id(category_id)
        if category is None:
            return not_found("expense_category_not_found", "Expense category not found.")
        try:
            delete_expense_category(category=category, actor=request.user)
        except BusinessRuleViolationError as exc:
            return error_from_exception(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["Accounting"])
class AdminExpenseCategoryRestoreView(RestoreAPIView):
    permission_classes: ClassVar[list] = [AccountingPostPermission]
    get_object_fn = staticmethod(get_expense_category_by_id)
    serializer_class = ExpenseCategorySerializer
    not_found_code = "expense_category_not_found"
    not_found_message = "Expense category not found."


@extend_schema(tags=["Accounting"])
class AdminTaxRateListCreateView(
    IncludeDeletedMixin, AccountingPermissionMixin, GenericListAPIView
):
    include_deleted_permission = AccountingPostPermission
    serializer_class = TaxRateSerializer
    search_fields = ("name", "region")
    ordering_fields = ("name",)
    default_ordering = "name"

    def get_queryset(self):
        return tax_rates_list(include_deleted=self.include_deleted())

    def get(self, request) -> Response:
        return self.list_response(request)

    def post(self, request) -> Response:
        serializer = TaxRateCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tax_rate = create_tax_rate(**serializer.validated_data)
        return Response(
            {"data": TaxRateSerializer(tax_rate).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Accounting"])
class AdminTaxRateDetailView(AccountingPermissionMixin, APIView):
    serializer_class = TaxRateSerializer

    def get(self, request, tax_rate_id) -> Response:
        tax_rate = get_tax_rate_by_id(tax_rate_id)
        if tax_rate is None:
            return not_found("tax_rate_not_found", "Tax rate not found.")
        return Response({"data": TaxRateSerializer(tax_rate).data, "message": "Success"})

    def patch(self, request, tax_rate_id) -> Response:
        tax_rate = get_tax_rate_by_id(tax_rate_id)
        if tax_rate is None:
            return not_found("tax_rate_not_found", "Tax rate not found.")
        serializer = TaxRateUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        tax_rate = update_tax_rate(tax_rate=tax_rate, data=dict(serializer.validated_data))
        return Response({"data": TaxRateSerializer(tax_rate).data, "message": "Success"})

    def delete(self, request, tax_rate_id) -> Response:
        tax_rate = get_tax_rate_by_id(tax_rate_id)
        if tax_rate is None:
            return not_found("tax_rate_not_found", "Tax rate not found.")
        delete_tax_rate(tax_rate=tax_rate, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["Accounting"])
class AdminTaxRateRestoreView(RestoreAPIView):
    permission_classes: ClassVar[list] = [AccountingPostPermission]
    get_object_fn = staticmethod(get_tax_rate_by_id)
    serializer_class = TaxRateSerializer
    not_found_code = "tax_rate_not_found"
    not_found_message = "Tax rate not found."


def _wants_csv(request) -> bool:
    return get_choice(request.query_params, "file_format", ["csv"]) == "csv"


@extend_schema(tags=["Accounting"])
class ProfitAndLossReportView(APIView):
    serializer_class = DateRangeSerializer
    permission_classes: ClassVar[list] = [AccountingViewPermission]
    renderer_classes: ClassVar[list] = [JSONRenderer, CsvRenderer]

    def get(self, request):
        serializer = DateRangeSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        params = dict(serializer.validated_data)
        if _wants_csv(request):
            return csv_response(
                "profit-and-loss.csv", REPORT_COLUMNS, profit_and_loss_rows(**params)
            )
        return Response({"data": profit_and_loss(**params), "message": "Success"})


@extend_schema(tags=["Accounting"])
class BalanceSheetReportView(APIView):
    serializer_class = AsOfSerializer
    permission_classes: ClassVar[list] = [AccountingViewPermission]
    renderer_classes: ClassVar[list] = [JSONRenderer, CsvRenderer]

    def get(self, request):
        serializer = AsOfSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        params = dict(serializer.validated_data)
        if _wants_csv(request):
            return csv_response("balance-sheet.csv", REPORT_COLUMNS, balance_sheet_rows(**params))
        return Response({"data": balance_sheet(**params), "message": "Success"})


@extend_schema(tags=["Accounting"])
class CashFlowReportView(APIView):
    serializer_class = DateRangeSerializer
    permission_classes: ClassVar[list] = [AccountingViewPermission]
    renderer_classes: ClassVar[list] = [JSONRenderer, CsvRenderer]

    def get(self, request):
        serializer = DateRangeSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        params = dict(serializer.validated_data)
        if _wants_csv(request):
            return csv_response("cash-flow.csv", REPORT_COLUMNS, cash_flow_rows(**params))
        return Response({"data": cash_flow(**params), "message": "Success"})


@extend_schema(tags=["Accounting"])
class InventoryValuationReportView(APIView):
    permission_classes: ClassVar[list] = [AccountingViewPermission]

    @extend_schema(request=None, responses=OpenApiTypes.OBJECT)
    def get(self, request) -> Response:
        value = inventory_valuation(kind=get_kind(request.query_params))
        return Response({"data": {"inventory_value": value}, "message": "Success"})
