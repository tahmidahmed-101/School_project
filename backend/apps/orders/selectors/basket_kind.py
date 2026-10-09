from __future__ import annotations

from apps.catalog.selectors.products import get_variants_by_ids
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.params import KIND_PREORDER, KIND_STOCK
from apps.orders.models import SalesOrder
from apps.orders.services.carts import MIXED_BASKET_MESSAGE


def _one_kind(flags: set[bool]) -> str:
    if len(flags) > 1:
        raise BusinessRuleViolationError(MIXED_BASKET_MESSAGE, code="mixed_basket")
    return KIND_PREORDER if True in flags else KIND_STOCK


def kind_for_items(items: list[dict]) -> str:
    """Which half of the shop a raw item list belongs to, read from the
    variants' categories. An empty list counts as stock."""
    ids = [item["variant_id"] for item in items]
    variants = get_variants_by_ids(ids).select_related("product__category")
    return _one_kind({variant.is_preorder_kind for variant in variants})


def kind_for_order(order: SalesOrder) -> str:
    """A cart has no `order_type` yet (checkout sets it), so a pending order
    is read from its lines."""
    if order.status != SalesOrder.Status.PENDING:
        return order.order_type
    lines = order.lines.select_related("variant__product__category")
    return _one_kind({line.variant.is_preorder_kind for line in lines})
