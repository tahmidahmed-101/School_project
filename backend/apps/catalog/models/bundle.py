from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import TimeStampedModel

from .variant import ProductVariant


class BundleItem(TimeStampedModel):
    bundle_variant = models.ForeignKey(
        ProductVariant, on_delete=models.CASCADE, related_name="bundle_components"
    )
    component_variant = models.ForeignKey(
        ProductVariant, on_delete=models.PROTECT, related_name="used_in_bundles"
    )
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["bundle_variant", "component_variant"], name="unique_bundle_component"
            )
        ]

    def __str__(self) -> str:
        return f"{self.bundle_variant.sku} x{self.quantity} -> {self.component_variant.sku}"
