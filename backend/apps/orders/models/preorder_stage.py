from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class PreorderStage(models.TextChoices):
    """Where a pre-order is on its way from the supplier to the customer.
    Staff move it by hand; it never drives stock, payment or accounting,
    which stay on `SalesOrder.status`."""

    PENDING_PAYMENT = "pending_payment", "Pending payment"
    PARTIALLY_PAID = "partially_paid", "Partially paid"
    PURCHASING = "purchasing", "Purchasing"
    PURCHASE_COMPLETED = "purchase_completed", "Purchase completed"
    SHIPPED_FROM_SUPPLIER = "shipped_from_supplier", "Shipped from supplier"
    RECEIVED_IN_CHINA_WAREHOUSE = "received_in_china_warehouse", "Received in China warehouse"
    ON_THE_WAY_TO_CHINA_AIRPORT = "on_the_way_to_china_airport", "On the way to China airport"
    RECEIVED_IN_CHINA_AIRPORT = "received_in_china_airport", "Received in China airport"
    ON_THE_WAY_TO_BD_AIRPORT = "on_the_way_to_bd_airport", "On the way to BD airport"
    RECEIVED_IN_BD_AIRPORT = "received_in_bd_airport", "Received in BD airport"
    ON_THE_WAY_TO_CHINA_SEAPORT = "on_the_way_to_china_seaport", "On the way to China seaport"
    RECEIVED_IN_CHINA_SEAPORT = "received_in_china_seaport", "Received in China seaport"
    ON_THE_WAY_TO_BD_SEAPORT = "on_the_way_to_bd_seaport", "On the way to BD seaport"
    RECEIVED_IN_BD_SEAPORT = "received_in_bd_seaport", "Received in BD seaport"
    OFFLOAD = "offload", "Offload"
    INSPECTION = "inspection", "Inspection"
    ON_THE_WAY_TO_BD_WAREHOUSE = "on_the_way_to_bd_warehouse", "On the way to BD warehouse"
    RECEIVED_IN_BD_WAREHOUSE = "received_in_bd_warehouse", "Received in BD warehouse"
    WAITING_FOR_RECEIVE_DUE_PAYMENT = (
        "waiting_for_receive_due_payment",
        "Waiting for receive due payment",
    )
    PROCESSING_FOR_DELIVERY = "processing_for_delivery", "Processing for delivery"
    ON_THE_WAY_TO_DELIVERY = "on_the_way_to_delivery", "On the way to delivery"
    COMPLETED = "completed", "Completed"
    HOLD = "hold", "Hold"
    CANCELLED = "cancelled", "Cancelled"


class PreorderStageEvent(TimeStampedModel):
    """One row per stage change, so the customer's timeline shows when each
    step happened and staff can see who recorded it."""

    order = models.ForeignKey(
        "orders.SalesOrder", on_delete=models.CASCADE, related_name="preorder_stage_events"
    )
    stage = models.CharField(max_length=40, choices=PreorderStage.choices)
    note = models.CharField(max_length=255, blank=True, default="")
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        ordering: ClassVar[list] = ["created_at"]
