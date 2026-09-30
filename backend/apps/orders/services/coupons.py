from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.audit.services.audit import log_action
from apps.common.exceptions import DomainError
from apps.common.services.soft_delete import soft_delete_instance
from apps.orders.models import Coupon, SalesOrder
from apps.orders.selectors.coupons import get_active_coupon_by_code
from apps.orders.services.carts import _ensure_pending
from apps.orders.services.orders import lock_order


@transaction.atomic
def create_coupon(*, code: str, discount_type: str, value: Decimal, **fields) -> Coupon:
    code = code.upper()
    if Coupon.objects.filter(code__iexact=code).exists():
        raise DomainError("A coupon with this code already exists.", code="duplicate_coupon_code")
    return Coupon.objects.create(code=code, discount_type=discount_type, value=value, **fields)


@transaction.atomic
def update_coupon(*, coupon: Coupon, **fields) -> Coupon:
    if "code" in fields:
        fields["code"] = fields["code"].upper()
        if Coupon.objects.filter(code__iexact=fields["code"]).exclude(id=coupon.id).exists():
            raise DomainError(
                "A coupon with this code already exists.", code="duplicate_coupon_code"
            )
    for field, value in fields.items():
        setattr(coupon, field, value)
    coupon.save(update_fields=[*fields.keys(), "updated_at"])
    return coupon


@transaction.atomic
def delete_coupon(*, coupon: Coupon, actor=None) -> Coupon:
    return soft_delete_instance(coupon, actor=actor, code="coupon_in_use")


def _compute_discount(coupon: Coupon, subtotal: Decimal) -> Decimal:
    if coupon.discount_type == Coupon.DiscountType.PERCENTAGE:
        discount = subtotal * coupon.value / Decimal("100")
    else:
        discount = coupon.value
    return min(discount, subtotal).quantize(Decimal("0.01"))


def _release_coupon(coupon_id) -> None:
    Coupon.objects.filter(id=coupon_id).update(times_used=F("times_used") - 1)


def _check_coupon_eligible(coupon: Coupon, subtotal: Decimal) -> None:
    """Shared by `apply_coupon` and `preview_coupon` so a code that passes
    preview cannot fail checkout (or vice versa) on a rule checked only in
    one of the two places."""
    if subtotal < coupon.min_order_amount:
        raise DomainError(
            f"Order subtotal must be at least {coupon.min_order_amount} to use this coupon.",
            code="coupon_minimum_not_met",
        )
    if coupon.expires_at is not None and coupon.expires_at < timezone.now():
        raise DomainError("This coupon has expired.", code="coupon_expired")
    if coupon.usage_limit is not None and coupon.times_used >= coupon.usage_limit:
        raise DomainError(
            "This coupon has reached its usage limit.", code="coupon_usage_limit_reached"
        )


def preview_coupon(*, code: str, subtotal: Decimal) -> dict:
    """Read-only eligibility check against a prospective subtotal, for a
    storefront to validate a code before it commits to an order. Does not
    lock the row or touch `times_used` — `apply_coupon` re-checks for real
    once there is an order to attach the coupon to."""
    coupon = get_active_coupon_by_code(code)
    if coupon is None:
        raise DomainError("Coupon not found.", code="invalid_coupon")
    _check_coupon_eligible(coupon, subtotal)
    return {
        "code": coupon.code,
        "discount_type": coupon.discount_type,
        "value": coupon.value,
        "discount_amount": _compute_discount(coupon, subtotal),
    }


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
    _check_coupon_eligible(coupon, order.subtotal)

    # Only a genuine switch touches times_used: releasing the old coupon and
    # counting a usage of the new one. Re-applying the coupon already on this
    # order must not count as a second use of it.
    if order.coupon_id != coupon.id:
        if order.coupon_id:
            _release_coupon(order.coupon_id)
        Coupon.objects.filter(id=coupon.id).update(times_used=F("times_used") + 1)

    order.coupon = coupon
    order.discount_total = _compute_discount(coupon, order.subtotal)
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


def revalidate_applied_coupon(order: SalesOrder) -> None:
    """Re-check a coupon that was applied to the cart earlier, at the moment
    checkout actually commits — mirrors the pre-order re-validation just above
    this call site in `checkout()`. `times_used` already counts this order's
    own application, so the limit check here is a plain `>`, not `>=`."""
    coupon = order.coupon
    if coupon is None:
        return
    if coupon.expires_at is not None and coupon.expires_at < timezone.now():
        raise DomainError("The applied coupon has expired.", code="coupon_expired")
    if coupon.usage_limit is not None and coupon.times_used > coupon.usage_limit:
        raise DomainError(
            "The applied coupon has reached its usage limit.", code="coupon_usage_limit_reached"
        )
    if order.subtotal < coupon.min_order_amount:
        raise DomainError(
            "Order no longer meets the coupon's minimum order amount.",
            code="coupon_minimum_not_met",
        )
