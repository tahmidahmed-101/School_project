from __future__ import annotations

import secrets
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum

from apps.accounting.selectors.tax_rates import get_default_tax_rate
from apps.business.constants import ModuleKey
from apps.business.selectors.modules import is_feature_enabled
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.utils.codes import generate_document_number, hash_code
from apps.common.utils.phone import BD_MOBILE_HELP, is_bd_mobile
from apps.orders.models import SalesOrder, SalesOrderLine
from apps.orders.selectors.sales_orders import get_cart


def default_tax_percent() -> Decimal:
    """The configured default rate's percent. Zero when tax is off or no
    TaxRate exists, so a fresh deployment behaves tax-free until configured."""
    if not is_feature_enabled(ModuleKey.ACCOUNTING, "tax"):
        return Decimal("0")
    rate = get_default_tax_rate()
    return rate.rate_percent if rate is not None else Decimal("0")


def compute_line_tax(
    *, unit_price: Decimal, quantity: int, tax_percent: Decimal | None = None
) -> Decimal:
    """Line tax from the configured default rate. Callers pricing several lines
    pass `tax_percent` (from `default_tax_percent`) to look the rate up once."""
    if tax_percent is None:
        tax_percent = default_tax_percent()
    if not tax_percent:
        return Decimal("0")
    amount = unit_price * quantity * tax_percent / Decimal("100")
    return amount.quantize(Decimal("0.01"))


@transaction.atomic
def get_or_create_cart(customer) -> SalesOrder:
    cart = get_cart(customer)
    if cart is not None:
        return cart
    return create_order(customer=customer)


@transaction.atomic
def create_order(*, customer, created_by=None, guest_token_hash: str | None = None) -> SalesOrder:
    """Start a brand-new pending order, never reusing an existing one.

    Staff-entered orders must use this rather than `get_or_create_cart`: that
    helper returns whatever pending cart the customer already has, so a phone
    order would otherwise be merged into the items sitting in the customer's
    own browser cart and charged along with them.
    """
    order_number = generate_document_number("SO")
    while SalesOrder.objects.filter(order_number=order_number).exists():
        order_number = generate_document_number("SO")
    return SalesOrder.objects.create(
        customer=customer,
        order_number=order_number,
        guest_token_hash=guest_token_hash,
        created_by=created_by,
        updated_by=created_by,
    )


def create_guest_cart() -> tuple[SalesOrder, str]:
    """An empty cart for an anonymous visitor, and the raw bearer token that
    addresses it. Only the token's SHA-256 is stored; the raw token is
    returned this once. 256 random bits, so no two carts share one, and the
    unique column would refuse it if they did."""
    token = secrets.token_urlsafe(32)
    return create_order(customer=None, guest_token_hash=hash_code(token)), token


@transaction.atomic
def set_cart_contact_phone(*, cart: SalesOrder, phone: str, name: str = "") -> SalesOrder:
    """Record the phone, and the name if given, a shopper typed at checkout on
    their still-open cart, so staff can follow up if they leave before placing
    the order. A blank name keeps the one already saved. These are the
    cart's contact details only: the owner's profile phone is never touched,
    and a guest checkout later overwrites it with the number submitted."""
    # Deferred import: services.orders imports this module at load time.
    from apps.orders.services.orders import lock_order

    lock_order(cart)
    if cart.status != SalesOrder.Status.PENDING or cart.deleted_at is not None:
        raise BusinessRuleViolationError(
            "Contact details can only be changed while the order is pending.", code="not_pending"
        )
    phone = (phone or "").strip()
    if not is_bd_mobile(phone):
        raise BusinessRuleViolationError(BD_MOBILE_HELP, code="invalid_phone")
    cart.contact_phone = phone
    name = " ".join((name or "").split())[:120]
    if name:
        cart.contact_name = name
    cart.save(update_fields=["contact_phone", "contact_name", "updated_at"])
    return cart


def get_preordered_quantity(variant) -> int:
    return (
        SalesOrderLine.objects.filter(
            variant=variant,
            is_preorder=True,
            order__status__in=[
                SalesOrder.Status.PENDING,
                SalesOrder.Status.AWAITING_PAYMENT,
                SalesOrder.Status.CONFIRMED,
                SalesOrder.Status.SHIPPED,
                SalesOrder.Status.DELIVERED,
            ],
        ).aggregate(total=Sum("quantity"))["total"]
        or 0
    )


def get_preordered_quantities(variants) -> dict:
    variant_ids = [v.id for v in variants]
    if not variant_ids:
        return {}
    return {
        item["variant_id"]: item["total"] or 0
        for item in SalesOrderLine.objects.filter(
            variant_id__in=variant_ids,
            is_preorder=True,
            order__status__in=[
                SalesOrder.Status.PENDING,
                SalesOrder.Status.AWAITING_PAYMENT,
                SalesOrder.Status.CONFIRMED,
                SalesOrder.Status.SHIPPED,
                SalesOrder.Status.DELIVERED,
            ],
        )
        .values("variant_id")
        .annotate(total=Sum("quantity"))
    }


def _check_preorder_stock_limit(
    variant, requested_quantity: int, current_line_quantity: int = 0
) -> None:
    if variant.preorder_stock_limit is None:
        return
    # Lock the variant row so two concurrent checkouts of the same variant
    # serialize instead of both reading the same pre-lock preordered count
    # and both passing the check. Deferred import: apps.catalog.models
    # imports this module at load time, so a top-level import here would cycle.
    from apps.catalog.models import ProductVariant

    ProductVariant.objects.select_for_update().get(pk=variant.pk)
    preordered = get_preordered_quantity(variant)
    # Subtract current line quantity since we're replacing/adding to it
    available = variant.preorder_stock_limit - (preordered - current_line_quantity)
    if requested_quantity > available:
        raise BusinessRuleViolationError(
            f"Pre-order stock limit reached. Only {available} units available for pre-order.",
            code="preorder_stock_exceeded",
        )


def _ensure_pending(order: SalesOrder) -> None:
    if order.status != SalesOrder.Status.PENDING:
        raise BusinessRuleViolationError(
            "Order lines can only be changed while the order is pending.", code="not_pending"
        )


@transaction.atomic
def add_line(
    *,
    order: SalesOrder,
    variant,
    quantity: int,
) -> SalesOrderLine:
    _ensure_pending(order)
    if quantity <= 0:
        raise BusinessRuleViolationError("Quantity must be positive.", code="invalid_quantity")

    # Validate pre-order availability
    if variant.is_preorder_enabled and not variant.is_preorder_active:
        raise BusinessRuleViolationError(
            "This product is not available for pre-order at this time.", code="preorder_not_active"
        )
    if variant.is_preorder_active and variant.preorder_stock_limit is not None:
        _check_preorder_stock_limit(variant, quantity)

    unit_price = variant.effective_price
    is_preorder = variant.is_preorder_active
    tax_amount = compute_line_tax(unit_price=unit_price, quantity=quantity)
    line, created = SalesOrderLine.objects.get_or_create(
        order=order,
        variant=variant,
        defaults={
            "quantity": quantity,
            "unit_price": unit_price,
            "tax_amount": tax_amount,
            "product_name": variant.product.name,
            "variant_sku": variant.sku,
            "is_preorder": is_preorder,
        },
    )
    if not created:
        # Check pre-order stock limit when increasing quantity
        if variant.is_preorder_active and variant.preorder_stock_limit is not None:
            _check_preorder_stock_limit(variant, line.quantity + quantity, line.quantity)
        line.quantity += quantity
        line.tax_amount = compute_line_tax(unit_price=line.unit_price, quantity=line.quantity)
        line.save(update_fields=["quantity", "tax_amount"])

    order.recalculate_totals()
    return line


@transaction.atomic
def update_line(*, line: SalesOrderLine, quantity: int) -> SalesOrderLine:
    _ensure_pending(line.order)
    if quantity <= 0:
        raise BusinessRuleViolationError("Quantity must be positive.", code="invalid_quantity")

    variant = line.variant
    # Validate pre-order stock limit when updating quantity
    if variant.is_preorder_active and variant.preorder_stock_limit is not None:
        _check_preorder_stock_limit(variant, quantity, line.quantity)

    line.quantity = quantity
    line.tax_amount = compute_line_tax(unit_price=line.unit_price, quantity=quantity)
    line.save(update_fields=["quantity", "tax_amount"])
    line.order.recalculate_totals()
    return line


@transaction.atomic
def remove_line(*, line: SalesOrderLine) -> None:
    _ensure_pending(line.order)
    order = line.order
    line.delete()
    order.recalculate_totals()
