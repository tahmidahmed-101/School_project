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

    order: models.ForeignKey = models.ForeignKey(
        SalesOrder, on_delete=models.PROTECT, related_name="shipments"
    )
    carrier: models.ForeignKey | None = models.ForeignKey(
        "logistics.Carrier",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="shipments",
    )
    tracking_number: models.CharField = models.CharField(max_length=100, blank=True)
    status: models.CharField = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    shipping_charge: models.DecimalField = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )
    cod_amount: models.DecimalField = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )
    courier_status: models.CharField = models.CharField(max_length=100, blank=True)
    shipped_at: models.DateTimeField | None = models.DateTimeField(null=True, blank=True)
    delivered_at: models.DateTimeField | None = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering: ClassVar[list] = ["-created_at"]
        indexes: ClassVar[list] = [
            models.Index(fields=["deleted_at", "status"], name="ship_del_status_idx"),
            models.Index(fields=["order", "deleted_at"], name="ship_order_del_idx"),
        ]

    def __str__(self) -> str:
        return f"Shipment for {self.order.order_number}"


class ShipmentLine(TimeStampedModel):
    shipment: models.ForeignKey = models.ForeignKey(
        Shipment, on_delete=models.CASCADE, related_name="lines"
    )
    order_line: models.ForeignKey = models.ForeignKey(
        SalesOrderLine, on_delete=models.PROTECT, related_name="shipment_lines"
    )
    quantity: models.PositiveIntegerField = models.PositiveIntegerField()

    def __str__(self) -> str:
        return f"{self.shipment_id}: {self.order_line_id} x{self.quantity}"
