from __future__ import annotations

import pytest

from apps.common.exceptions import BusinessRuleViolationError
from apps.common.services.soft_delete import (
    ensure_not_referenced,
    restore_instance,
    soft_delete_instance,
)
from apps.logistics.factories import CarrierFactory, ShippingRateFactory
from apps.procurement.factories import PurchaseOrderFactory, SupplierFactory

pytestmark = pytest.mark.django_db


def test_soft_delete_instance_marks_deleted_and_stamps_actor(admin_user):
    carrier = CarrierFactory()

    soft_delete_instance(carrier, actor=admin_user)

    carrier.refresh_from_db()
    assert carrier.deleted_at is not None
    assert carrier.deleted_by_id == admin_user.id


def test_soft_delete_instance_refuses_when_referenced():
    carrier = CarrierFactory()
    ShippingRateFactory(carrier=carrier)

    with pytest.raises(BusinessRuleViolationError) as exc_info:
        soft_delete_instance(carrier, protected_relations=("rates",), code="carrier_in_use")

    assert exc_info.value.code == "carrier_in_use"
    carrier.refresh_from_db()
    assert carrier.deleted_at is None


def test_ensure_not_referenced_ignores_soft_deleted_children():
    supplier = SupplierFactory()
    purchase_order = PurchaseOrderFactory(supplier=supplier)

    with pytest.raises(BusinessRuleViolationError):
        ensure_not_referenced(supplier, ("purchase_orders",), code="supplier_in_use")

    purchase_order.soft_delete()
    ensure_not_referenced(supplier, ("purchase_orders",), code="supplier_in_use")


def test_restore_instance_clears_deletion(admin_user):
    carrier = CarrierFactory()
    soft_delete_instance(carrier, actor=admin_user)

    restore_instance(carrier)

    carrier.refresh_from_db()
    assert carrier.deleted_at is None
    assert carrier.deleted_by_id is None


def test_restore_instance_rejects_a_live_record():
    carrier = CarrierFactory()

    with pytest.raises(BusinessRuleViolationError) as exc_info:
        restore_instance(carrier)

    assert exc_info.value.code == "not_deleted"
