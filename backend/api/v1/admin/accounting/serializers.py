from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers

from apps.accounting.models import Account, JournalEntry


class AccountSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    code = serializers.CharField()
    name = serializers.CharField()
    type = serializers.ChoiceField(choices=Account.Type.choices)
    parent_id = serializers.UUIDField(read_only=True, allow_null=True)
    is_active = serializers.BooleanField()
    deleted_at = serializers.DateTimeField(read_only=True, allow_null=True)


class AccountCreateSerializer(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField()
    type = serializers.ChoiceField(choices=Account.Type.choices)
    parent_id = serializers.UUIDField(required=False, allow_null=True)


class AccountUpdateSerializer(serializers.Serializer):
    code = serializers.CharField(required=False)
    name = serializers.CharField(required=False)
    type = serializers.ChoiceField(choices=Account.Type.choices, required=False)
    parent_id = serializers.UUIDField(required=False, allow_null=True)
    is_active = serializers.BooleanField(required=False)


class JournalEntryLineSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    account_id = serializers.UUIDField(read_only=True)
    debit = serializers.DecimalField(max_digits=14, decimal_places=2)
    credit = serializers.DecimalField(max_digits=14, decimal_places=2)


class JournalEntryLineInputSerializer(serializers.Serializer):
    account_id = serializers.UUIDField()
    debit = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, default=Decimal("0")
    )
    credit = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, default=Decimal("0")
    )


class JournalEntrySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    entry_date = serializers.DateField()
    reference_type = serializers.CharField(allow_blank=True)
    reference_id = serializers.UUIDField(allow_null=True)
    status = serializers.ChoiceField(choices=JournalEntry.Status.choices)
    description = serializers.CharField(allow_blank=True)
    reverses_id = serializers.UUIDField(read_only=True, allow_null=True)
    reversed_by_id = serializers.SerializerMethodField()
    lines = serializers.SerializerMethodField()

    def get_lines(self, obj) -> list[dict]:
        return JournalEntryLineSerializer(obj.lines.all(), many=True).data

    def get_reversed_by_id(self, obj) -> str | None:
        reversal = next((item for item in obj.reversals.all() if item.deleted_at is None), None)
        return str(reversal.id) if reversal else None


class JournalEntryReverseSerializer(serializers.Serializer):
    entry_date = serializers.DateField(required=False)
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class JournalEntryCreateSerializer(serializers.Serializer):
    entry_date = serializers.DateField()
    reference_type = serializers.CharField(required=False, allow_blank=True, default="")
    reference_id = serializers.UUIDField(required=False, allow_null=True)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    lines = JournalEntryLineInputSerializer(many=True)


class TaxRateSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField()
    rate_percent = serializers.DecimalField(max_digits=5, decimal_places=2)
    region = serializers.CharField(allow_blank=True)
    is_active = serializers.BooleanField()
    is_default = serializers.BooleanField(read_only=True)
    deleted_at = serializers.DateTimeField(read_only=True, allow_null=True)


class TaxRateCreateSerializer(serializers.Serializer):
    name = serializers.CharField()
    rate_percent = serializers.DecimalField(max_digits=5, decimal_places=2)
    region = serializers.CharField(required=False, allow_blank=True)


class TaxRateUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(required=False)
    rate_percent = serializers.DecimalField(max_digits=5, decimal_places=2, required=False)
    region = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)
    is_default = serializers.BooleanField(required=False)


class ExpenseCategorySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField()
    description = serializers.CharField(allow_blank=True)
    expense_account_id = serializers.UUIDField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    deleted_at = serializers.DateTimeField(read_only=True, allow_null=True)


class ExpenseCategoryCreateSerializer(serializers.Serializer):
    name = serializers.CharField()
    description = serializers.CharField(required=False, allow_blank=True, default="")
    # Optional: simple mode hides the chart of accounts, so the service supplies
    # the fallback account instead.
    expense_account_id = serializers.UUIDField(required=False, allow_null=True)


class ExpenseCategoryUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    expense_account_id = serializers.UUIDField(required=False)
    is_active = serializers.BooleanField(required=False)


class ExpenseSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    expense_date = serializers.DateField()
    payee = serializers.CharField()
    description = serializers.CharField(allow_blank=True)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    expense_account_id = serializers.UUIDField(read_only=True)
    category_id = serializers.UUIDField(read_only=True, allow_null=True)
    payment_account_id = serializers.UUIDField(read_only=True)
    reference_number = serializers.CharField(allow_blank=True)
    journal_entry_id = serializers.UUIDField(read_only=True, allow_null=True)
    deleted_at = serializers.DateTimeField(read_only=True, allow_null=True)


class ExpenseCreateSerializer(serializers.Serializer):
    expense_date = serializers.DateField()
    payee = serializers.CharField()
    description = serializers.CharField(required=False, allow_blank=True, default="")
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    expense_account_id = serializers.UUIDField(required=False, allow_null=True)
    category_id = serializers.UUIDField(required=False, allow_null=True)
    payment_account_id = serializers.UUIDField()
    reference_number = serializers.CharField(required=False, allow_blank=True, default="")


class ExpenseUpdateSerializer(serializers.Serializer):
    payee = serializers.CharField(required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    reference_number = serializers.CharField(required=False, allow_blank=True)


class AsOfSerializer(serializers.Serializer):
    as_of = serializers.DateField()
