from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from apps.accounts.models import Address, User
from apps.accounts.selectors.users import get_active_user_by_email
from apps.accounts.services.addresses import create_address
from apps.accounts.services.users import create_user
from apps.catalog.selectors.products import get_variant_by_id, get_variants_by_ids
from apps.common.exceptions import BusinessRuleViolationError, DomainError
from apps.common.utils.codes import generate_document_number
from apps.logistics.selectors.rates import (
    get_carrier_by_id,
)
from apps.orders.models import SalesOrder, SalesOrderLine
from apps.orders.services.carts import _check_preorder_stock_limit, compute_line_tax


def _variants_by_id(items: list[dict]) -> dict:
    ids = [item["variant_id"] for item in items]
    return {str(variant.id): variant for variant in get_variants_by_ids(ids)}


def weight_for_items(items: list[dict]) -> Decimal:
    """Shipment weight for a raw item list, mirroring `checkout.order_weight`
    for callers that don't have an order yet — a guest's shipping quote."""
    variants_by_id = _variants_by_id(items)
    weight = Decimal("0")
    for item in items:
        variant = variants_by_id.get(str(item["variant_id"]))
        if variant is None:
            raise BusinessRuleViolationError("Variant not found.", code="variant_not_found")
        if variant.weight is not None:
            weight += variant.weight * item["quantity"]
    return weight


def subtotal_for_items(items: list[dict]) -> Decimal:
    """Order subtotal for a raw item list — same per-line price `guest_checkout`
    would charge, used to preview a coupon before an order exists."""
    variants_by_id = _variants_by_id(items)
    subtotal = Decimal("0")
    for item in items:
        variant = variants_by_id.get(str(item["variant_id"]))
        if variant is None:
            raise BusinessRuleViolationError("Variant not found.", code="variant_not_found")
        subtotal += variant.effective_price * item["quantity"]
    return subtotal


def _is_preorder_line(line: SalesOrderLine) -> bool:
    variant = line.variant
    return variant.is_preorder_enabled and variant.is_preorder_active


def _get_or_create_guest_user(
    *,
    email: str,
    phone: str,
    first_name: str,
    last_name: str,
) -> User:
    email = email.lower().strip() if email else ""
    phone = phone.strip() if phone else ""
    first_name = first_name.strip() if first_name else ""
    last_name = last_name.strip() if last_name else ""

    user = get_active_user_by_email(email) if email else None
    if user:
        if phone and not user.phone:
            user.phone = phone
            user.save(update_fields=["phone"])
        return user

    if not email:
        raise BusinessRuleViolationError(
            "Email is required for guest checkout.", code="email_required"
        )

    from django.utils.crypto import get_random_string
    temp_password = get_random_string(32)
    return create_user(
        email=email,
        password=temp_password,
        first_name=first_name,
        last_name=last_name,
        phone=phone,
    )


def _create_guest_address(
    *,
    user: User,
    full_name: str,
    phone: str,
    line1: str,
    line2: str = "",
    city: str = "",
    state: str = "",
    postal_code: str = "",
    country: str = "Bangladesh",
) -> Address:
    return create_address(
        user=user,
        data={
            "address_type": Address.AddressType.SHIPPING,
            "full_name": full_name.strip(),
            "phone": phone.strip(),
            "line1": line1.strip(),
            "line2": line2.strip(),
            "city": city.strip(),
            "state": state.strip(),
            "postal_code": postal_code.strip(),
            "country": country.strip(),
            "is_default": True,
        },
    )


def _generate_order_number() -> str:
    order_number = generate_document_number("SO")
    while SalesOrder.objects.filter(order_number=order_number).exists():
        order_number = generate_document_number("SO")
    return order_number


@transaction.atomic
def guest_checkout(
    *,
    email: str,
    phone: str,
    first_name: str,
    last_name: str,
    items: list[dict],
    shipping_address: dict,
    payment_method: str,
    carrier_id: str | None = None,
    coupon_code: str | None = None,
    notes: str = "",
    ip_address: str = "",
) -> SalesOrder:
    user = _get_or_create_guest_user(
        email=email,
        phone=phone,
        first_name=first_name,
        last_name=last_name,
    )

    address = _create_guest_address(
        user=user,
        full_name=shipping_address.get("full_name", f"{first_name} {last_name}"),
        phone=shipping_address.get("phone", phone),
        line1=shipping_address["line1"],
        line2=shipping_address.get("line2", ""),
        city=shipping_address.get("city", ""),
        state=shipping_address.get("state", ""),
        postal_code=shipping_address.get("postal_code", ""),
        country=shipping_address.get("country", "Bangladesh"),
    )

    order_number = _generate_order_number()

    order = SalesOrder.objects.create(
        customer=user,
        order_number=order_number,
        contact_email=email,
        contact_phone=phone,
        notes=notes,
        status=SalesOrder.Status.PENDING,
    )

    if not items:
        order.delete()
        raise BusinessRuleViolationError("Cannot checkout an empty order.", code="empty_order")

    for item in items:
        if item["quantity"] <= 0:
            order.delete()
            raise BusinessRuleViolationError("Quantity must be positive.", code="invalid_quantity")

    # Combine repeated references to the same variant before validation —
    # matching add_line's cart-side merge — so a duplicated variant can't
    # validate each fragment against the pre-order limit separately and slip
    # a combined quantity past it.
    combined_items: dict[str, int] = {}
    for item in items:
        variant_id = str(item["variant_id"])
        combined_items[variant_id] = combined_items.get(variant_id, 0) + item["quantity"]

    for variant_id, quantity in combined_items.items():
        variant = get_variant_by_id(variant_id)
        if variant is None:
            order.delete()
            raise BusinessRuleViolationError("Variant not found.", code="variant_not_found")

        if variant.is_preorder_enabled and not variant.is_preorder_active:
            order.delete()
            raise BusinessRuleViolationError(
                "This product is not available for pre-order at this time.",
                code="preorder_not_active",
            )
        if variant.is_preorder_active and variant.preorder_stock_limit is not None:
            _check_preorder_stock_limit(variant, quantity)

        unit_price = variant.effective_price
        is_preorder = variant.is_preorder_active
        tax_amount = compute_line_tax(unit_price=unit_price, quantity=quantity)

        SalesOrderLine.objects.create(
            order=order,
            variant=variant,
            quantity=quantity,
            unit_price=unit_price,
            tax_amount=tax_amount,
            product_name=variant.product.name,
            variant_sku=variant.sku,
            is_preorder=is_preorder,
        )

    order.recalculate_totals()

    if coupon_code:
        from apps.orders.services.coupons import apply_coupon
        try:
            apply_coupon(order=order, code=coupon_code, actor=user)
        except DomainError as exc:
            # A guest checkout is one irreversible form submission — a bad
            # coupon code shouldn't cost the customer their whole order, so
            # these fall back to no discount rather than aborting checkout.
            if exc.code not in (
                "invalid_coupon",
                "coupon_expired",
                "coupon_usage_limit_reached",
                "coupon_minimum_not_met",
            ):
                raise

    carrier = None
    if carrier_id:
        carrier = get_carrier_by_id(carrier_id)
        if carrier is None:
            order.delete()
            raise BusinessRuleViolationError("Carrier not found.", code="carrier_not_found")

    from apps.orders.services.checkout import checkout
    order = checkout(
        order=order, shipping_address=address, carrier=carrier, ip_address=ip_address
    )

    from apps.orders.services.payments import capture_payment
    capture_payment(order=order, amount=order.grand_total, method=payment_method)
    order.refresh_from_db()
    return order