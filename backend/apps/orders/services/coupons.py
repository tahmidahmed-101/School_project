from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from apps.audit.services.audit import log_action
from apps.catalog.selectors.categories import category_ids_with_descendants
from apps.catalog.services.sales import stock_brands, stock_categories
from apps.common.exceptions import BusinessRuleViolationError, DomainError
from apps.common.params import KIND_PREORDER
from apps.common.services.soft_delete import soft_delete_instance
from apps.common.utils.money import percent_of, quantize
from apps.common.utils.phone import local_bd_mobile
from apps.orders.models import Coupon, SalesOrder
from apps.orders.selectors.coupons import get_active_coupon_by_code
from apps.orders.services.carts import _ensure_pending, lines_of_kind
from apps.orders.services.orders import lock_order

COUPON_STOCK_ONLY_MESSAGE = "Coupons work on stock orders only, not on a pre-order."


def _set_scope(coupon: Coupon, *, category_ids=None, brand_ids=None) -> None:
    if category_ids is not None:
        coupon.categories.set(
            stock_categories(
                category_ids, code="coupon_stock_only", message=COUPON_STOCK_ONLY_MESSAGE
            )
        )
    if brand_ids is not None:
        coupon.brands.set(
            stock_brands(brand_ids, code="coupon_stock_only", message=COUPON_STOCK_ONLY_MESSAGE)
        )


@transaction.atomic
def create_coupon(
    *,
    code: str,
    discount_type: str,
    value: Decimal,
    category_ids=None,
    brand_ids=None,
    **fields,
) -> Coupon:
    code = code.upper()
    if Coupon.objects.filter(code__iexact=code).exists():
        raise DomainError("A coupon with this code already exists.", code="duplicate_coupon_code")
    coupon = Coupon.objects.create(code=code, discount_type=discount_type, value=value, **fields)
    _set_scope(coupon, category_ids=category_ids, brand_ids=brand_ids)
    return coupon


@transaction.atomic
def update_coupon(*, coupon: Coupon, category_ids=None, brand_ids=None, **fields) -> Coupon:
    if "code" in fields:
        fields["code"] = fields["code"].upper()
        if Coupon.objects.filter(code__iexact=fields["code"]).exclude(id=coupon.id).exists():
            raise DomainError(
                "A coupon with this code already exists.", code="duplicate_coupon_code"
            )
    for field, value in fields.items():
        setattr(coupon, field, value)
    if fields:
        coupon.save(update_fields=[*fields.keys(), "updated_at"])
    _set_scope(coupon, category_ids=category_ids, brand_ids=brand_ids)
    return coupon


@transaction.atomic
def delete_coupon(*, coupon: Coupon, actor=None) -> Coupon:
    return soft_delete_instance(coupon, actor=actor, code="coupon_in_use")


def _compute_discount(coupon: Coupon, base: Decimal) -> Decimal:
    """Discount on `base` (the part of the order the coupon covers), held under
    the coupon's own cap and never more than `base`. Rounded once, here."""
    if coupon.discount_type == Coupon.DiscountType.PERCENTAGE:
        discount = percent_of(base, coupon.value)
    else:
        discount = coupon.value
    if coupon.max_discount_amount is not None:
        discount = min(discount, coupon.max_discount_amount)
    return quantize(min(discount, base))


def _release_coupon(coupon_id) -> None:
    Coupon.objects.filter(id=coupon_id).update(times_used=F("times_used") - 1)


def order_priced_lines(order: SalesOrder) -> list[tuple]:
    """(product, line total) per line: what a scoped coupon is matched against."""
    return [
        (line.variant.product, line.unit_price * line.quantity)
        for line in order.lines.select_related("variant__product")
    ]


def _discount_base(coupon: Coupon, subtotal: Decimal, priced_lines: list[tuple]) -> Decimal:
    """The amount the coupon works on: the whole subtotal, or for a coupon tied
    to categories or brands, only the lines that match (child categories count)."""
    category_ids = category_ids_with_descendants(coupon.categories.values_list("id", flat=True))
    brand_ids = set(coupon.brands.values_list("id", flat=True))
    if not category_ids and not brand_ids:
        return subtotal
    matching = [
        amount
        for product, amount in priced_lines
        if product.category_id in category_ids or product.brand_id in brand_ids
    ]
    if not matching:
        raise DomainError(
            "This coupon does not cover any item in the order.", code="coupon_not_applicable"
        )
    return sum(matching, Decimal("0"))


def _orders_of_shopper(*, customer, phone: str, email: str):
    """Placed orders of one shopper. A registered customer is their account; a
    guest is the phone or email their orders carry. None when nobody is known."""
    if customer is not None and not customer.is_guest:
        who = Q(customer=customer)
    else:
        who = Q(customer=customer) if customer is not None else Q()
        if phone:
            local = local_bd_mobile(phone)
            who |= Q(contact_phone__in={phone, local})
            who |= Q(customer__is_guest=True, customer__phone=local)
        if email:
            who |= Q(contact_email__iexact=email)
    if not who:
        return None
    return SalesOrder.objects.filter(who, deleted_at__isnull=True).exclude(
        status__in=(SalesOrder.Status.PENDING, SalesOrder.Status.CANCELLED)
    )


def _check_customer_limit(
    coupon: Coupon, *, customer, phone: str, email: str, exclude_order_id=None
) -> None:
    if coupon.per_customer_limit is None:
        return
    orders = _orders_of_shopper(customer=customer, phone=phone, email=email)
    if orders is None:
        return
    used = orders.filter(coupon=coupon).exclude(id=exclude_order_id).count()
    if used >= coupon.per_customer_limit:
        raise DomainError(
            "You have already used this coupon as many times as it allows.",
            code="coupon_customer_limit_reached",
        )


def _check_coupon_eligible(
    coupon: Coupon,
    subtotal: Decimal,
    *,
    customer=None,
    phone: str = "",
    email: str = "",
    exclude_order_id=None,
    count_this_use: bool = True,
) -> None:
    """Shared by `apply_coupon`, `preview_coupon` and the re-check at checkout,
    so a code that passes one cannot fail another on a rule checked in only one
    place. `count_this_use` is off when `times_used` already counts this order."""
    if subtotal < coupon.min_order_amount:
        raise DomainError(
            f"Order subtotal must be at least {coupon.min_order_amount} to use this coupon.",
            code="coupon_minimum_not_met",
        )
    now = timezone.now()
    if coupon.starts_at is not None and now < coupon.starts_at:
        raise DomainError("This coupon is not active yet.", code="coupon_not_started")
    if coupon.expires_at is not None and coupon.expires_at < now:
        raise DomainError("This coupon has expired.", code="coupon_expired")
    uses = coupon.times_used + (1 if count_this_use else 0)
    if coupon.usage_limit is not None and uses > coupon.usage_limit:
        raise DomainError(
            "This coupon has reached its usage limit.", code="coupon_usage_limit_reached"
        )
    _check_customer_limit(
        coupon, customer=customer, phone=phone, email=email, exclude_order_id=exclude_order_id
    )


def preview_coupon(
    *,
    code: str,
    subtotal: Decimal,
    holds_preorder: bool = False,
    priced_lines: list[tuple] | None = None,
    customer=None,
    phone: str = "",
    email: str = "",
) -> dict:
    """Read-only eligibility check against a prospective subtotal, for a
    storefront to validate a code before it commits to an order. Does not
    lock the row or touch `times_used` — `apply_coupon` re-checks for real
    once there is an order to attach the coupon to."""
    if holds_preorder:
        raise BusinessRuleViolationError(COUPON_STOCK_ONLY_MESSAGE, code="coupon_stock_only")
    coupon = get_active_coupon_by_code(code)
    if coupon is None:
        raise DomainError("Coupon not found.", code="invalid_coupon")
    _check_coupon_eligible(coupon, subtotal, customer=customer, phone=phone, email=email)
    base = _discount_base(coupon, subtotal, priced_lines or [])
    return {
        "code": coupon.code,
        "discount_type": coupon.discount_type,
        "value": coupon.value,
        "discount_amount": _compute_discount(coupon, base),
    }


def order_discount(order: SalesOrder, coupon: Coupon) -> Decimal:
    return _compute_discount(
        coupon, _discount_base(coupon, order.subtotal, order_priced_lines(order))
    )


@transaction.atomic
def apply_coupon(*, order: SalesOrder, code: str, actor=None) -> SalesOrder:
    # Locks the order row too, not just the coupon: without it, two
    # concurrent applies (different codes, or one apply racing a remove)
    # could both read the same stale order.coupon_id, both take the "new
    # apply" branch, and the second write silently overwrites the first —
    # corrupting times_used (both coupons get incremented, but only one
    # ends up attached) and losing whichever change lost the race.
    lock_order(order)
    _ensure_pending(order)
    if lines_of_kind(order.lines, KIND_PREORDER).exists():
        raise BusinessRuleViolationError(COUPON_STOCK_ONLY_MESSAGE, code="coupon_stock_only")
    # Locks the row for the rest of the transaction so two concurrent applies
    # against a usage-limited coupon can't both read the same times_used and
    # both pass the limit check.
    coupon = (
        Coupon.objects.select_for_update()
        .filter(code__iexact=code, is_active=True, deleted_at__isnull=True)
        .first()
    )
    if coupon is None:
        raise DomainError("Coupon not found.", code="invalid_coupon")
    _check_coupon_eligible(
        coupon,
        order.subtotal,
        customer=order.customer,
        phone=order.contact_phone,
        email=order.contact_email,
        exclude_order_id=order.id,
    )
    discount = order_discount(order, coupon)

    # Only a genuine switch touches times_used: releasing the old coupon and
    # counting a usage of the new one. Re-applying the coupon already on this
    # order must not count as a second use of it.
    if order.coupon_id != coupon.id:
        if order.coupon_id:
            _release_coupon(order.coupon_id)
        Coupon.objects.filter(id=coupon.id).update(times_used=F("times_used") + 1)

    order.coupon = coupon
    order.discount_total = discount
    order.save(update_fields=["coupon", "discount_total", "updated_at"])
    order.recalculate_totals()
    order.refresh_from_db()
    log_action(
        actor=actor,
        action="order.coupon_applied",
        target_type="SalesOrder",
        target_id=order.id,
        metadata={"coupon_code": coupon.code},
    )
    return order


@transaction.atomic
def remove_coupon(*, order: SalesOrder, actor=None) -> SalesOrder:
    lock_order(order)
    _ensure_pending(order)
    if order.coupon_id and order.coupon is not None:
        coupon_code = order.coupon.code
        _release_coupon(order.coupon_id)
        order.coupon = None
        order.discount_total = Decimal("0")
        order.save(update_fields=["coupon", "discount_total", "updated_at"])
        order.recalculate_totals()
        log_action(
            actor=actor,
            action="order.coupon_removed",
            target_type="SalesOrder",
            target_id=order.id,
            metadata={"coupon_code": coupon_code},
        )
    return order


def drop_coupon_from_preorder(order: SalesOrder) -> None:
    """Coupons are for stock orders. One left on a basket that became a
    pre-order is taken off and its use handed back, rather than failing the order."""
    if order.coupon_id is None:
        return
    _release_coupon(order.coupon_id)
    order.coupon = None
    order.discount_total = Decimal("0")
    order.save(update_fields=["coupon", "discount_total", "updated_at"])
    order.recalculate_totals()


def revalidate_applied_coupon(order: SalesOrder) -> None:
    """Re-check a coupon applied to the cart earlier, at the moment checkout
    commits, and re-work its discount from the lines as they are now: a cart
    can gain, lose or re-price lines after the coupon went on."""
    coupon = order.coupon
    if coupon is None:
        return
    _check_coupon_eligible(
        coupon,
        order.subtotal,
        customer=order.customer,
        phone=order.contact_phone,
        email=order.contact_email,
        exclude_order_id=order.id,
        count_this_use=False,
    )
    discount = order_discount(order, coupon)
    if discount != order.discount_total:
        order.discount_total = discount
        order.save(update_fields=["discount_total", "updated_at"])
