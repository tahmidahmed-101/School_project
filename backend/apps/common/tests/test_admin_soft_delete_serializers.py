from __future__ import annotations

import pytest

from api.v1.admin.accounting.serializers import (
    AccountSerializer,
    ExpenseSerializer,
    TaxRateSerializer,
)
from api.v1.admin.logistics.serializers import CarrierSerializer, ShippingZoneSerializer
from api.v1.admin.procurement.serializers import SupplierSerializer
from apps.accounting.factories import AccountFactory, ExpenseFactory, TaxRateFactory
from apps.logistics.factories import CarrierFactory, ShippingZoneFactory
from apps.procurement.factories import SupplierFactory

pytestmark = pytest.mark.django_db

SERIALIZERS = [
    (CarrierSerializer, CarrierFactory),
    (ShippingZoneSerializer, ShippingZoneFactory),
    (SupplierSerializer, SupplierFactory),
    (AccountSerializer, AccountFactory),
    (ExpenseSerializer, ExpenseFactory),
    (TaxRateSerializer, TaxRateFactory),
]


@pytest.mark.parametrize(
    ("serializer_class", "factory_class"),
    SERIALIZERS,
    ids=[s.__name__ for s, _ in SERIALIZERS],
)
def test_admin_serializer_exposes_deleted_at(serializer_class, factory_class):
    instance = factory_class()

    assert serializer_class(instance).data["deleted_at"] is None

    instance.soft_delete()

    assert serializer_class(instance).data["deleted_at"] is not None


@pytest.mark.parametrize(
    "serializer_class",
    [s for s, _ in SERIALIZERS],
    ids=[s.__name__ for s, _ in SERIALIZERS],
)
def test_admin_serializer_deleted_at_is_read_only(serializer_class):
    assert serializer_class().fields["deleted_at"].read_only is True
