from __future__ import annotations

from decimal import Decimal

import factory

from apps.catalog.factories import ProductVariantFactory
from apps.inventory.constants import MovementType
from apps.inventory.models import StockItem, StockLedgerEntry
from apps.inventory.selectors.warehouse import get_or_create_default_warehouse


class StockItemFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = StockItem
        django_get_or_create = ("variant", "warehouse")

    variant = factory.SubFactory(ProductVariantFactory)
    warehouse = factory.LazyFunction(get_or_create_default_warehouse)
    quantity_on_hand = 0
    quantity_reserved = 0
    avg_cost = Decimal("0")
    reorder_point = 0
    target_stock_level = 0


class StockLedgerEntryFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = StockLedgerEntry

    variant = factory.SubFactory(ProductVariantFactory)
    warehouse = factory.LazyFunction(get_or_create_default_warehouse)
    movement_type = MovementType.PURCHASE_IN
    quantity = 10
    unit_cost = Decimal("8.00")
    balance_after = 10
    reference_type = ""
    reference_id = None
    notes = ""
    created_by = None
