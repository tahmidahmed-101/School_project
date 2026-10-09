from __future__ import annotations

from django.db import transaction

from apps.audit.services.audit import log_action
from apps.common.exceptions import BusinessRuleViolationError
from apps.orders.models import PreorderStage, PreorderStageEvent, SalesOrder
from apps.orders.services.orders import lock_order


@transaction.atomic
def set_preorder_stage(*, order: SalesOrder, stage: str, note: str = "", actor=None) -> SalesOrder:
    """Record where a pre-order is between the supplier and the customer.

    Tracking only: the order's own status, stock holds and payments are left
    alone, so marking a stage `cancelled` does not cancel the order.
    """
    order = lock_order(order)
    if stage not in PreorderStage.values:
        raise BusinessRuleViolationError("Unknown pre-order stage.", code="invalid_preorder_stage")
    if order.status == SalesOrder.Status.PENDING:
        raise BusinessRuleViolationError(
            "An open cart has no pre-order stage; it is set once the order is placed.",
            code="order_not_placed",
        )
    if order.order_type != SalesOrder.OrderType.PREORDER:
        raise BusinessRuleViolationError(
            "This order has no pre-order items.", code="not_a_preorder"
        )
    if stage == order.preorder_stage:
        return order

    previous = order.preorder_stage
    order.preorder_stage = stage
    order.updated_by = actor
    order.save(update_fields=["preorder_stage", "updated_by", "updated_at"])
    PreorderStageEvent.objects.create(
        order=order, stage=stage, note=(note or "").strip(), changed_by=actor
    )
    log_action(
        actor=actor,
        action="order.preorder_stage_changed",
        target_type="SalesOrder",
        target_id=order.id,
        metadata={"from": previous, "to": stage},
    )
    return order
