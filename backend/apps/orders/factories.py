from __future__ import annotations

from decimal import Decimal

import factory

from apps.accounts.factories import CustomerUserFactory
from apps.catalog.factories import ProductVariantFactory
from apps.logistics.factories import CarrierFactory
from apps.orders.models import (
    Coupon,
    Payment,
    ReturnRMA,
    ReturnRMALine,
    SalesOrder,
    SalesOrderLine,
    Shipment,
    ShipmentLine,
    StockReservation,
)


class CouponFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Coupon

    code = factory.Sequence(lambda n: f"COUPON{n:06d}")
    discount_type = Coupon.DiscountType.PERCENTAGE
    value = Decimal("10.00")
    min_order_amount = Decimal("0")
    usage_limit = None
    times_used = 0
    expires_at = None


class SalesOrderFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = SalesOrder

    order_number = factory.Sequence(lambda n: f"SO-{n:08d}")
    customer = factory.SubFactory(CustomerUserFactory)
    status = SalesOrder.Status.PENDING


class SalesOrderLineFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = SalesOrderLine

    order = factory.SubFactory(SalesOrderFactory)
    variant = factory.SubFactory(ProductVariantFactory)
    quantity = 2
    unit_price = Decimal("19.99")
    tax_amount = Decimal("0")


class StockReservationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = StockReservation

    order_line = factory.SubFactory(SalesOrderLineFactory)
    variant = factory.SubFactory(ProductVariantFactory)
    quantity = 2
    status = StockReservation.Status.ACTIVE


class ShipmentFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Shipment

    order = factory.SubFactory(SalesOrderFactory)
    carrier = factory.SubFactory(CarrierFactory)
    tracking_number = factory.Sequence(lambda n: f"TRACK{n:08d}")
    status = Shipment.Status.PENDING


class ShipmentLineFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ShipmentLine

    shipment = factory.SubFactory(ShipmentFactory)
    order_line = factory.SubFactory(SalesOrderLineFactory)
    quantity = 1


class PaymentFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Payment

    order = factory.SubFactory(SalesOrderFactory)
    amount = Decimal("39.98")
    method = "card"
    status = Payment.Status.CAPTURED
    gateway_reference = ""


class ReturnRMAFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ReturnRMA

    rma_number = factory.Sequence(lambda n: f"RMA-{n:08d}")
    order = factory.SubFactory(SalesOrderFactory)
    status = ReturnRMA.Status.REQUESTED
    reason = "Changed mind"


class ReturnRMALineFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ReturnRMALine

    rma = factory.SubFactory(ReturnRMAFactory)
    order_line = factory.SubFactory(SalesOrderLineFactory)
    quantity = 1
    condition = ReturnRMALine.Condition.SELLABLE
