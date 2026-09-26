from __future__ import annotations

from django.db.models import F, Sum, Value
from django.db.models.functions import Greatest

from apps.inventory.constants import MovementType
from apps.inventory.models import StockItem, StockLedgerEntry
from apps.orders.models import ReturnRMA, ReturnRMALine
from apps.procurement.models import GRNLine


def stock_status_summary() -> dict:
    """Distribute stock across the six statuses of blueprint §6.

    Every bucket is derived from existing state — StockItem on-hand/reserved
    snapshots, ledger entries, GRN rejections and ungraded return lines —
    nothing here is stored separately. Aggregated in the database rather than
    summed in Python so this scales with ledger size."""
    items = StockItem.objects.all()

    item_totals = items.aggregate(
        reserved=Sum("quantity_reserved"),
        sellable=Sum(Greatest(F("quantity_on_hand") - F("quantity_reserved"), Value(0))),
    )
    reserved = item_totals["reserved"] or 0
    sellable = item_totals["sellable"] or 0

    ledger = StockLedgerEntry.objects.all()

    movement_totals = (
        ledger.filter(
            movement_type__in=[
                MovementType.TRANSFER_OUT,
                MovementType.TRANSFER_IN,
                MovementType.WRITE_OFF,
            ]
        )
        .values("movement_type")
        .annotate(total=Sum("quantity"))
    )
    totals_by_type = {row["movement_type"]: row["total"] or 0 for row in movement_totals}
    transfer_out = totals_by_type.get(MovementType.TRANSFER_OUT, 0)
    transfer_in = totals_by_type.get(MovementType.TRANSFER_IN, 0)
    written_off = totals_by_type.get(MovementType.WRITE_OFF, 0)

    grn_lines = GRNLine.objects.filter(condition=GRNLine.Condition.REJECTED)
    quarantine = grn_lines.aggregate(total=Sum("quantity_received"))["total"] or 0

    rma_lines = ReturnRMALine.objects.filter(condition="", rma__status=ReturnRMA.Status.RECEIVED)
    pending_return_inspection = rma_lines.aggregate(total=Sum("quantity"))["total"] or 0

    return {
        "sellable": sellable,
        "reserved": reserved,
        "in_transit": transfer_out - transfer_in,
        "quarantine": quarantine,
        "pending_return_inspection": pending_return_inspection,
        "written_off": written_off,
    }
