from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

import factory

from apps.catalog.factories import ProductVariantFactory
from apps.procurement.models import (
    GoodsReceiptNote,
    GRNLine,
    PurchaseOrder,
    PurchaseOrderLine,
    Supplier,
    VendorBill,
    VendorPayment,
)


class SupplierFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Supplier

    name = factory.Sequence(lambda n: f"Supplier {n}")
    contact_email = factory.Sequence(lambda n: f"supplier{n}@example.com")
    phone = ""
    payment_terms = "Net 30"


class PurchaseOrderFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = PurchaseOrder

    po_number = factory.Sequence(lambda n: f"PO-{n:08d}")
    supplier = factory.SubFactory(SupplierFactory)
    status = PurchaseOrder.Status.DRAFT
    order_date = factory.LazyFunction(date.today)
    notes = ""


class PurchaseOrderLineFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = PurchaseOrderLine

    purchase_order = factory.SubFactory(PurchaseOrderFactory)
    variant = factory.SubFactory(ProductVariantFactory)
    quantity_ordered = 10
    quantity_received = 0
    unit_cost = Decimal("5.00")


class GoodsReceiptNoteFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = GoodsReceiptNote

    purchase_order = factory.SubFactory(PurchaseOrderFactory)
    received_date = factory.LazyFunction(date.today)
    received_by = None
    status = GoodsReceiptNote.Status.PENDING


class GRNLineFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = GRNLine

    goods_receipt = factory.SubFactory(GoodsReceiptNoteFactory)
    purchase_order_line = factory.SubFactory(PurchaseOrderLineFactory)
    quantity_received = 10
    condition = GRNLine.Condition.ACCEPTED


class VendorBillFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = VendorBill

    bill_number = factory.Sequence(lambda n: f"BILL-{n:08d}")
    purchase_order = factory.SubFactory(PurchaseOrderFactory)
    supplier = factory.SubFactory(SupplierFactory)
    amount = Decimal("50.00")
    due_date = factory.LazyFunction(date.today)
    status = VendorBill.Status.UNPAID


class VendorPaymentFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = VendorPayment

    vendor_bill = factory.SubFactory(VendorBillFactory)
    amount = Decimal("50.00")
    paid_at = factory.LazyFunction(lambda: datetime.now(UTC))
    method = "bank_transfer"
    reference = ""
