from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from apps.accounts.models import Address, User
from apps.accounts.services.addresses import create_address
from apps.accounts.services.users import get_or_create_guest_customer
from apps.catalog.selectors.products import get_variants_by_ids
from apps.common.exceptions import BusinessRuleViolationError, DomainError
from apps.common.utils.codes import generate_document_number
from apps.common.utils.phone import BD_MOBILE_HELP, is_bd_mobile
from apps.logistics.selectors.rates import (
    get_carrier_by_id,
)
from apps.orders.constants import STOREFRONT_PAYMENT_METHODS
from apps.orders.models import SalesOrder, SalesOrderLine
from apps.orders.services.carts import (
    _check_preorder_stock_limit,
    compute_line_tax,
    default_tax_percent,
    ensure_purchasable,
)
from apps.orders.services.orders import lock_order


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


def items_hold_preorder(items: list[dict]) -> bool:
    ids = [item["variant_id"] for item in items]
    return any(
        variant.is_preorder_kind
        for variant in get_variants_by_ids(ids).select_related("product__category")
    )


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


def _guest_identity(*, phone: str, first_name: str, last_name: str) -> User:
    """Anonymous checkout's owner. A typed email or phone is not proof of
    owning a registered account, so it never selects one — orders go to the
    phone's guest identity, and the typed contact details stay on the order."""
    if not is_bd_mobile(phone):
        raise BusinessRuleViolationError(BD_MOBILE_HELP, code="invalid_phone")
    return get_or_create_guest_customer(
        phone=phone, first_name=first_name.strip(), last_name=last_name.strip()
    )


def _create_guest_address(
    *,
    user: User,
    is_default: bool,
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
            "is_default": is_default,
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
    phone: str,
    first_name: str,
    shipping_address: dict,
    payment_method: str,
    items: list[dict] | None = None,
    email: str = "",
    last_name: str = "",
    carrier_id: str | None = None,
    coupon_code: str | None = None,
    notes: str = "",
    ip_address: str = "",
    customer: User | None = None,
    cart: SalesOrder | None = None,
) -> SalesOrder:
    """`customer` is the authenticated requester, if any — the only way an
    order reaches a registered account from here. `cart` is a saved guest
    cart to check out instead of building an order from `items`."""
    if payment_method not in STOREFRONT_PAYMENT_METHODS:
        raise BusinessRuleViolationError(
            "Choose cash on delivery, bKash or Nagad.", code="payment_method_not_offered"
        )
    if customer is not None:
        user = customer
    else:
        user = _guest_identity(phone=phone, first_name=first_name, last_name=last_name)

    address = _create_guest_address(
        user=user,
        # A signed-in customer's address book gains this address but keeps
        # its default; a guest identity's newest address is its default.
        is_default=user.is_guest,
        full_name=shipping_address.get("full_name", f"{first_name} {last_name}"),
        phone=shipping_address.get("phone", phone),
        line1=shipping_address["line1"],
        line2=shipping_address.get("line2", ""),
        city=shipping_address.get("city", ""),
        state=shipping_address.get("state", ""),
        postal_code=shipping_address.get("postal_code", ""),
        country=shipping_address.get("country", "Bangladesh"),
    )

    if cart is not None:
        order = _claim_guest_cart(cart, owner=user, email=email, phone=phone, notes=notes)
    else:
        order = _order_from_items(items or [], owner=user, email=email, phone=phone, notes=notes)

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
                "coupon_stock_only",
            ):
                raise

    carrier = None
    if carrier_id:
        carrier = get_carrier_by_id(carrier_id)
        if carrier is None:
            order.delete()
            raise BusinessRuleViolationError("Carrier not found.", code="carrier_not_found")

    from apps.orders.services.checkout import checkout

    order = checkout(order=order, shipping_address=address, carrier=carrier, ip_address=ip_address)

    from apps.orders.services.payments import record_payment_due

    # A storefront order never counts as paid: nobody has verified any money.
    record_payment_due(order=order, method=payment_method)
    order.refresh_from_db()
    return order


def _claim_guest_cart(
    cart: SalesOrder, *, owner: User, email: str, phone: str, notes: str
) -> SalesOrder:
    """Give a saved guest cart its owner and contact details. Locked first,
    so two checkouts of one cart can't both claim it; the lines stay as the
    guest's cart services left them and `checkout` re-prices them."""
    lock_order(cart)
    if cart.status != SalesOrder.Status.PENDING or cart.customer_id is not None:
        raise BusinessRuleViolationError(
            "Only a pending order can be checked out.", code="not_pending"
        )
    if not cart.lines.exists():
        raise BusinessRuleViolationError("Cannot checkout an empty order.", code="empty_order")
    cart.customer = owner
    cart.contact_email = email
    cart.contact_phone = phone
    cart.notes = notes
    cart.save(update_fields=["customer", "contact_email", "contact_phone", "notes", "updated_at"])
    return cart


def _order_from_items(
    items: list[dict], *, owner: User, email: str, phone: str, notes: str
) -> SalesOrder:
    """A one-shot order built from the checkout form's item list."""
    order = SalesOrder.objects.create(
        customer=owner,
        order_number=_generate_order_number(),
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

    # One query for every variant (and its product, for the line snapshot) and
    # one tax-rate lookup for the whole order, rather than one of each per item.
    variants_by_id = {
        str(variant.id): variant
        for variant in get_variants_by_ids(list(combined_items)).select_related("product__category")
    }
    tax_percent = default_tax_percent()

    for variant_id, quantity in combined_items.items():
        variant = variants_by_id.get(variant_id)
        if variant is None:
            order.delete()
            raise BusinessRuleViolationError("Variant not found.", code="variant_not_found")

        try:
            ensure_purchasable(variant)
        except BusinessRuleViolationError:
            order.delete()
            raise
        is_preorder = variant.is_preorder_kind
        if is_preorder and variant.preorder_stock_limit is not None:
            _check_preorder_stock_limit(variant, quantity)

        unit_price = variant.effective_price
        tax_amount = compute_line_tax(
            unit_price=unit_price, quantity=quantity, tax_percent=tax_percent
        )

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
    return order
