from __future__ import annotations

from django.db import models


class MovementType(models.TextChoices):
    PURCHASE_IN = "purchase_in", "Purchase receipt"
    RETURN_IN = "return_in", "Customer return"
    TRANSFER_IN = "transfer_in", "Transfer in"
    ADJUSTMENT_IN = "adjustment_in", "Adjustment (+)"
    SALES_OUT = "sales_out", "Sales shipment"
    TRANSFER_OUT = "transfer_out", "Transfer out"
    ADJUSTMENT_OUT = "adjustment_out", "Adjustment (-)"
    WRITE_OFF = "write_off", "Write-off"


IN_MOVEMENT_TYPES = frozenset(
    {
        MovementType.PURCHASE_IN,
        MovementType.RETURN_IN,
        MovementType.TRANSFER_IN,
        MovementType.ADJUSTMENT_IN,
    }
)

OUT_MOVEMENT_TYPES = frozenset(
    {
        MovementType.SALES_OUT,
        MovementType.TRANSFER_OUT,
        MovementType.ADJUSTMENT_OUT,
        MovementType.WRITE_OFF,
    }
)
