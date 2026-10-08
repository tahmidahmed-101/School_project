from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from apps.common.exceptions import BusinessRuleViolationError
from apps.orders.constants import PaymentMethodKey
from apps.orders.models import SalesOrder
from apps.orders.selectors.payments import order_deposit_due
from apps.orders.services.carts import create_guest_cart, create_order
from apps.orders.services.checkout import checkout
from apps.orders.services.coupons import COUPON_STOCK_ONLY_MESSAGE
from apps.orders.services.orders import add_staff_order_lines
from apps.orders.services.payments import capture_payment, record_payment_due

PREORDER = SalesOrder.OrderType.PREORDER
STOCK = SalesOrder.OrderType.STOCK


def _refuse_preorder_price_cuts(*, kind: str, coupon_code: str, discount: Decimal | None) -> None:
    if kind != PREORDER:
        return
    if (coupon_code or "").strip():
        raise BusinessRuleViolationError(COUPON_STOCK_ONLY_MESSAGE, code="coupon_stock_only")
    if discount:
        raise BusinessRuleViolationError(
            "A pre-order takes no discount.", code="discount_stock_only"
        )


def _checked_out(
    order: SalesOrder, *, lines: list[tuple], kind: str, shipping_address, carrier
) -> SalesOrder:
    add_staff_order_lines(order=order, lines=lines, kind=kind)
    return checkout(order=order, shipping_address=shipping_address, carrier=carrier)


@transaction.atomic
def place_staff_order(
    *,
    customer,
    lines: list[tuple],
    kind: str = STOCK,
    shipping_address=None,
    carrier=None,
    payment_method: str = PaymentMethodKey.MANUAL,
    capture: bool = True,
    coupon_code: str = "",
    discount: Decimal | None = None,
    actor=None,
) -> SalesOrder:
    """An order staff key in for a customer, through the shopper's own cart,
    checkout and payment steps. A pre-order is never paid here: it waits for
    its deposit exactly as one placed on the storefront does."""
    _refuse_preorder_price_cuts(kind=kind, coupon_code=coupon_code, discount=discount)
    order = _checked_out(
        create_order(customer=customer, created_by=actor),
        lines=lines,
        kind=kind,
        shipping_address=shipping_address,
        carrier=carrier,
    )
    method = payment_method or PaymentMethodKey.MANUAL
    if kind == PREORDER or method == PaymentMethodKey.COD:
        record_payment_due(order=order, method=method)
    elif capture:
        capture_payment(order=order, amount=order.grand_total, method=method)
    order.refresh_from_db()
    return order


def quote_staff_order(
    *, lines: list[tuple], kind: str = STOCK, shipping_address=None, carrier=None
) -> dict:
    """What `place_staff_order` would charge. The order is really built and
    checked out, then rolled back, so a quote cannot drift from the order."""
    with transaction.atomic():
        cart, _token = create_guest_cart()
        order = _checked_out(
            cart, lines=lines, kind=kind, shipping_address=shipping_address, carrier=carrier
        )
        quote = {
            "order_type": order.order_type,
            "subtotal": order.subtotal,
            "tax_total": order.tax_total,
            "shipping_total": order.shipping_total,
            "grand_total": order.grand_total,
            "deposit_due": order_deposit_due(order),
        }
        transaction.set_rollback(True)
    return quote
