from __future__ import annotations

from django.db.models import QuerySet

from apps.inventory.models import StockLedgerEntry

LEDGER_EXPORT_COLUMNS = [
    "created_at",
    "variant_sku",
    "movement_type",
    "quantity",
    "unit_cost",
    "balance_after",
    "reference_type",
    "reference_id",
    "notes",
]


def export_ledger_entries(queryset: QuerySet[StockLedgerEntry]) -> list[list[str]]:
    entries = queryset.select_related("variant")
    return [
        [
            entry.created_at.isoformat(),
            entry.variant.sku,
            entry.movement_type,
            str(entry.quantity),
            str(entry.unit_cost) if entry.unit_cost is not None else "",
            str(entry.balance_after),
            entry.reference_type,
            str(entry.reference_id) if entry.reference_id else "",
            entry.notes,
        ]
        for entry in entries
    ]
