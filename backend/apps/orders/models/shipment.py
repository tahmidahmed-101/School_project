from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import FullAuditModel, TimeStampedModel

from .sales_order import SalesOrder, SalesOrderLine


class Shipment(FullAuditModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SHIPPED = "shipped", "Shipped"
        IN_TRANSIT = "in_transit", "In Transit"
        OUT_FOR_DELIVERY = "out_for_delivery", "Out for Delivery"
        DELIVERED = "delivered", "Delivered"
        FAILED = "failed", "Failed"
        RETURNED = "returned", "Returned"
        CANCELLED = "cancelled", "Cancelled"

    TERMINAL_STATUSES = (Status.DELIVERED, Status.RETURNED, Status.CANCELLED)

    order = models.ForeignKey(SalesOrder, on_delete=models.PROTECT, related_name="shipments")
    carrier = models.ForeignKey(
        "logistics.Carrier",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="shipments",
    )
    tracking_number = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    shipping_charge = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cod_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    courier_status = models.CharField(max_length=100, blank=True)
    shipped_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    received_back_at = models.DateTimeField(null=True, blank=True)
    includes_shipping_revenue = models.BooleanField(default=False)
    recipient_phone = models.CharField(max_length=20, blank=True, db_index=True)

    class Meta:
        ordering: ClassVar[list] = ["-created_at"]
        indexes: ClassVar[list] = [
            models.Index(fields=["deleted_at", "status"], name="ship_del_status_idx"),
            models.Index(fields=["order", "deleted_at"], name="ship_order_del_idx"),
        ]

    def __str__(self) -> str:
        return f"Shipment for {self.order.order_number}"


class ShipmentLine(TimeStampedModel):
    shipment = models.ForeignKey(Shipment, on_delete=models.CASCADE, related_name="lines")
    order_line = models.ForeignKey(
        SalesOrderLine, on_delete=models.PROTECT, related_name="shipment_lines"
    )
    quantity = models.PositiveIntegerField()
    # Units that came back damaged when the consignment was received back.
    # They were written off, so they stay counted as shipped but undelivered:
    # the order cannot be delivered or reshipped for them until staff resolve it.
    damaged_quantity = models.PositiveIntegerField(default=0)
    # How many of those damaged units `replace_damaged_units` has since freed to
    # ship again with replacement stock. Still owed = damaged - replaced.
    replaced_quantity = models.PositiveIntegerField(default=0)
    # False only for pre-order consignments sent before pre-order lines moved
    # stock; receiving those back must not add units that never left.
    stock_posted = models.BooleanField(default=True)

    @property
    def unresolved_damaged_quantity(self) -> int:
        return self.damaged_quantity - self.replaced_quantity

    def __str__(self) -> str:
        return f"{self.shipment_id}: {self.order_line_id} x{self.quantity}"
