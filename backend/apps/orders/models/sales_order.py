from __future__ import annotations

from decimal import Decimal
from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.common.models import FullAuditModel, TimeStampedModel

from .preorder_stage import PreorderStage


class SalesOrder(FullAuditModel):
    """Lifecycle: `pending` (still an editable cart) -> `awaiting_payment`
    (checked out, stock reserved, lines frozen) -> `confirmed` (payment
    captured) -> `shipped` (every line fully shipped) -> `delivered`.
    `cancelled` is reachable from any pre-shipment state.

    The `awaiting_payment` step exists so checkout is not re-entrant: once an
    order leaves `pending`, `carts._ensure_pending` refuses further line
    edits and `checkout` refuses to reserve stock a second time.
    """

    class OrderType(models.TextChoices):
        STOCK = "stock", "Stock"
        PREORDER = "preorder", "Pre-order"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        AWAITING_PAYMENT = "awaiting_payment", "Awaiting payment"
        CONFIRMED = "confirmed", "Confirmed"
        SHIPPED = "shipped", "Shipped"
        DELIVERED = "delivered", "Delivered"
        CANCELLED = "cancelled", "Cancelled"
        CLOSED = "closed", "Closed"

    order_number = models.CharField(max_length=32, unique=True)
    # Null only on an anonymous guest cart (see `guest_token_hash`); checkout
    # assigns the owner, so every checked-out order has one.
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="sales_orders",
    )
    # SHA-256 of an anonymous guest cart's bearer token. The raw token is
    # handed to the guest once and never stored.
    guest_token_hash = models.CharField(
        max_length=64, unique=True, null=True, blank=True, editable=False
    )
    shipping_address = models.ForeignKey(
        "accounts.Address", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    # The FK is SET_NULL, so a deleted address would otherwise blank the ship-to
    # block on invoices that were already issued.
    shipping_address_snapshot = models.JSONField(default=dict, blank=True)
    coupon = models.ForeignKey(
        "orders.Coupon", on_delete=models.SET_NULL, null=True, blank=True, related_name="orders"
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    # Set at checkout from the lines; an open cart is untyped and reads "stock".
    order_type = models.CharField(
        max_length=20, choices=OrderType.choices, default=OrderType.STOCK, db_index=True
    )
    notes = models.TextField(blank=True)
    # Order-level overrides. Blank means "use the customer account's value" —
    # correcting a typo on one order must not rewrite the customer's profile.
    contact_email = models.EmailField(blank=True, default="")
    contact_phone = models.CharField(max_length=32, blank=True, default="")
    # Typed at checkout before the order is placed, so an abandoned checkout
    # still says who to call back.
    contact_name = models.CharField(max_length=120, blank=True, default="")
    # Blank on stock orders and until staff set the first stage.
    preorder_stage = models.CharField(
        max_length=40, choices=PreorderStage.choices, blank=True, default="", db_index=True
    )
    # Staff reached the customer and they still want a cash-on-delivery order.
    # Says nothing about money: the payment stays pending until it is captured.
    cod_verified_at = models.DateTimeField(null=True, blank=True)
    cod_verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    shipping_total = models.DecimalField(
        max_digits=14, decimal_places=2, default=0
    )
    discount_total = models.DecimalField(
        max_digits=14, decimal_places=2, default=0
    )
    grand_total = models.DecimalField(
        max_digits=14, decimal_places=2, default=0
    )

    class Meta:
        ordering: ClassVar[list] = ["-created_at"]
        indexes: ClassVar[list] = [
            models.Index(fields=["status"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["customer", "deleted_at"], name="so_cust_del_idx"),
            models.Index(fields=["deleted_at", "status"], name="so_del_status_idx"),
        ]
        constraints: ClassVar[list] = [
            # An order without a customer must be a token-addressed guest cart.
            models.CheckConstraint(
                condition=(
                    models.Q(customer__isnull=False) | models.Q(guest_token_hash__isnull=False)
                ),
                name="so_customer_or_guest_token",
            ),
        ]

    def __str__(self) -> str:
        return self.order_number

    def recalculate_totals(self) -> None:
        lines = list(self.lines.all())
        subtotal = sum((line.unit_price * line.quantity for line in lines), Decimal("0"))
        tax_total = sum((line.tax_amount for line in lines), Decimal("0"))
        self.subtotal = subtotal
        self.tax_total = tax_total
        # Clamp at 0: stacked automatic discounts + a coupon can otherwise
        # combine to exceed subtotal + tax + shipping and go negative.
        self.grand_total = max(
            subtotal + tax_total + self.shipping_total - self.discount_total,
            Decimal("0"),
        )
        self.save(update_fields=["subtotal", "tax_total", "grand_total", "updated_at"])


class SalesOrderLine(TimeStampedModel):
    order = models.ForeignKey(
        SalesOrder, on_delete=models.CASCADE, related_name="lines"
    )
    variant = models.ForeignKey(
        "catalog.ProductVariant", on_delete=models.PROTECT, related_name="sales_order_lines"
    )
    quantity = models.PositiveIntegerField()
    # Snapshotted at add time: an invoice must keep saying what was sold, even
    # after the product is renamed or the SKU is reissued.
    product_name = models.CharField(max_length=200, blank=True)
    variant_sku = models.CharField(max_length=64, blank=True)
    variant_title = models.CharField(max_length=160, blank=True, default="")
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    tax_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )
    discount_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )
    # Pre-order tracking
    is_preorder = models.BooleanField(default=False)
    # Units of a pre-order line that arrived stock has been set aside for.
    # A pre-order line can ship only what is allocated.
    allocated_quantity = models.PositiveIntegerField(default=0)
    # Fulfillment counters. Denormalized rather than aggregated per call so
    # `create_shipment` / `create_rma` can lock the line row (select_for_update)
    # and check the remaining balance in the same statement, closing the
    # over-ship / over-return race.
    shipped_quantity = models.PositiveIntegerField(default=0)
    returned_quantity = models.PositiveIntegerField(default=0)

    class Meta:
        constraints: ClassVar[list] = [
            models.CheckConstraint(
                condition=models.Q(shipped_quantity__lte=models.F("quantity")),
                name="orderline_shipped_not_over_ordered",
            ),
            models.CheckConstraint(
                condition=models.Q(returned_quantity__lte=models.F("shipped_quantity")),
                name="orderline_returned_not_over_shipped",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.order_id}: {self.variant_id} x{self.quantity}"

    @property
    def shippable_quantity(self) -> int:
        if self.is_preorder:
            return self.allocated_quantity - self.shipped_quantity
        return self.quantity - self.shipped_quantity

    @property
    def awaiting_stock_quantity(self) -> int:
        return self.quantity - self.allocated_quantity if self.is_preorder else 0

    @property
    def returnable_quantity(self) -> int:
        return self.shipped_quantity - self.returned_quantity
