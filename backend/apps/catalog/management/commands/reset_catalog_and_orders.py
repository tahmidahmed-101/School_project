from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import connection, transaction

from apps.accounting.models import JournalEntry
from apps.catalog.models import BundleItem, Product, ProductImage, ProductVariant
from apps.inventory.models import StockItem, StockLedgerEntry
from apps.orders.models import (
    Payment,
    ReturnRMA,
    ReturnRMALine,
    SalesOrder,
    SalesOrderLine,
    Shipment,
    ShipmentLine,
    StockReservation,
)
from apps.procurement.models import (
    GoodsReceiptNote,
    GRNLine,
    PurchaseOrder,
    PurchaseOrderLine,
    VendorBill,
    VendorPayment,
)

# Tables of the removed coupons/discounts apps, never dropped: they still hold
# FK rows into orders and products, which Postgres rejects the deletes over.
ORPHAN_TABLES = (
    "discounts_applieddiscount",
    "discounts_discount_products",
    "discounts_discount_categories",
    "coupons_couponusage",
    "coupons_ordercoupon",
    "coupons_coupon_products",
    "coupons_coupon_categories",
    "coupons_coupon_customers",
)


def _ids(queryset) -> list:
    return list(queryset.values_list("id", flat=True))


def _clear_orphan_tables(stdout) -> None:
    with connection.cursor() as cursor:
        existing = set(connection.introspection.table_names(cursor))
        for table in ORPHAN_TABLES:
            if table not in existing:
                continue
            cursor.execute(f'DELETE FROM "{table}"')  # noqa: S608 - fixed allowlist above
            if cursor.rowcount:
                stdout.write(f"  cleared {cursor.rowcount} row(s) from orphan {table}")


class Command(BaseCommand):
    help = "Delete every product, combo and order. Users, addresses, categories and settings stay."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Actually delete. Without it the command only reports what it would remove.",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        counts = {
            "orders": SalesOrder.objects.count(),
            "order_lines": SalesOrderLine.objects.count(),
            "payments": Payment.objects.count(),
            "shipments": Shipment.objects.count(),
            "returns": ReturnRMA.objects.count(),
            "purchase_orders": PurchaseOrder.objects.count(),
            "goods_receipts": GoodsReceiptNote.objects.count(),
            "vendor_bills": VendorBill.objects.count(),
            "stock_items": StockItem.objects.count(),
            "ledger_entries": StockLedgerEntry.objects.count(),
            "bundle_components": BundleItem.objects.count(),
            "product_images": ProductImage.objects.count(),
            "variants": ProductVariant.objects.count(),
            "products": Product.objects.count(),
        }
        for name, count in counts.items():
            self.stdout.write(f"  {name:<20} {count}")

        if not options["apply"]:
            self.stdout.write(self.style.WARNING("\nDry run. Re-run with --apply to delete."))
            return

        # Postings reference their source document by id, with no FK to cascade
        # through — collect the ids before the documents are gone.
        reference_ids = [
            *_ids(Payment.objects.all()),
            *_ids(Shipment.objects.all()),
            *_ids(ReturnRMA.objects.all()),
            *_ids(GRNLine.objects.all()),
            *_ids(VendorBill.objects.all()),
            *_ids(VendorPayment.objects.all()),
            *_ids(StockLedgerEntry.objects.all()),
            *_ids(SalesOrder.objects.all()),
        ]
        JournalEntry.objects.filter(reference_id__in=reference_ids).delete()

        _clear_orphan_tables(self.stdout)

        ShipmentLine.objects.all().delete()
        Shipment.objects.all().delete()
        ReturnRMALine.objects.all().delete()
        ReturnRMA.objects.all().delete()
        Payment.objects.all().delete()
        StockReservation.objects.all().delete()
        SalesOrderLine.objects.all().delete()
        SalesOrder.objects.all().delete()

        VendorPayment.objects.all().delete()
        VendorBill.objects.all().delete()
        GRNLine.objects.all().delete()
        GoodsReceiptNote.objects.all().delete()
        PurchaseOrderLine.objects.all().delete()
        PurchaseOrder.objects.all().delete()

        StockLedgerEntry.objects.all().delete()
        StockItem.objects.all().delete()

        BundleItem.objects.all().delete()
        ProductImage.objects.all().delete()
        ProductVariant.objects.all().delete()
        Product.objects.all().delete()

        self.stdout.write(self.style.SUCCESS("\nWiped. Users, addresses and categories kept."))
