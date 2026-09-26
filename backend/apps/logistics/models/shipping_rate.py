from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import TimeStampedModel

from .carrier import Carrier
from .shipping_zone import ShippingZone


class ShippingRate(TimeStampedModel):
    """One base/increment pricing config per zone+carrier. Charge = base_charge
    + ceil((weight - base_weight) / increment_weight) * increment_charge,
    floored at base_charge for weight <= base_weight."""

    zone: models.ForeignKey = models.ForeignKey(
        ShippingZone, on_delete=models.CASCADE, related_name="rates"
    )
    carrier: models.ForeignKey = models.ForeignKey(
        Carrier, on_delete=models.CASCADE, related_name="rates"
    )
    base_weight: models.DecimalField = models.DecimalField(max_digits=10, decimal_places=3)
    base_charge: models.DecimalField = models.DecimalField(max_digits=10, decimal_places=2)
    increment_weight: models.DecimalField = models.DecimalField(max_digits=10, decimal_places=3)
    increment_charge: models.DecimalField = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        ordering: ClassVar[list] = ["zone__name", "carrier__name"]
        constraints: ClassVar[list] = [
            models.UniqueConstraint(fields=["zone", "carrier"], name="uniq_rate_per_zone_carrier")
        ]

    def __str__(self) -> str:
        return f"{self.zone.name}/{self.carrier.name}"
