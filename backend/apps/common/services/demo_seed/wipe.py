from __future__ import annotations

from django.db import models, transaction

from apps.accounting.models import Account, Expense, ExpenseCategory, JournalEntry, TaxRate
from apps.accounts.models import Address, User
from apps.audit.models import AuditLog, LoginHistory
from apps.business.models import HeroSlide, PromoLine
from apps.catalog.models import (
    Brand,
    BundleItem,
    Category,
    Product,
    ProductImage,
    ProductVariant,
)
from apps.common.services.demo_seed.constants import (
    AUDIT_MARKER,
    CARRIER_MARKER,
    DEMO_BLOCKED_IPS,
    DEMO_BLOCKED_PHONES,
    DEMO_COUPONS,
    DEMO_DOMAIN,
    DEMO_FRAUD_CASE_PREFIX,
    EXPENSE_CATEGORY_NOTE,
    EXPENSE_REF_PREFIX,
    EXTRA_ACCOUNTS,
    HERO_ALT_PREFIX,
    NEWSLETTER_SIGNUPS,
    OPENING_REFERENCE_TYPE,
    PROMO_LINES,
    SKU_PREFIX,
    SLUG_PREFIX,
    TAX_RATE_NAME,
)
from apps.inventory.models import StockItem, StockLedgerEntry
from apps.logistics.models import Carrier, ShippingRate
from apps.marketing.models import NewsletterSubscriber
from apps.orders.models import (
    Coupon,
    Payment,
    ReturnRMA,
    ReturnRMALine,
    SalesOrder,
    Shipment,
    ShipmentLine,
    StockReservation,
)
from apps.procurement.models import (
    GoodsReceiptNote,
    GRNLine,
    PurchaseOrder,
    Supplier,
    VendorBill,
    VendorPayment,
)
from apps.risk.models import FraudCase, IPBlock, PhoneBlock


def _ids(queryset) -> list:
    return list(queryset.values_list("id", flat=True))


def _journal_reference_ids(*, orders, purchase_orders, variants) -> list:
    shipments = Shipment.objects.filter(order__in=orders)
    rmas = ReturnRMA.objects.filter(order__in=orders)
    grn_lines = GRNLine.objects.filter(goods_receipt__purchase_order__in=purchase_orders)
    bills = VendorBill.objects.filter(purchase_order__in=purchase_orders)
    return [
        *_ids(Payment.objects.filter(order__in=orders)),
        *_ids(shipments),
        *_ids(rmas),
        *_ids(grn_lines),
        *_ids(bills),
        *_ids(VendorPayment.objects.filter(vendor_bill__in=bills)),
        *_ids(StockLedgerEntry.objects.filter(variant__in=variants)),
    ]


def _wipe_orders(orders) -> None:
    ShipmentLine.objects.filter(shipment__order__in=orders).delete()
    Shipment.objects.filter(order__in=orders).delete()
    ReturnRMALine.objects.filter(rma__order__in=orders).delete()
    ReturnRMA.objects.filter(order__in=orders).delete()
    Payment.objects.filter(order__in=orders).delete()
    StockReservation.objects.filter(order_line__order__in=orders).delete()
    orders.delete()


def _wipe_procurement(purchase_orders, suppliers) -> None:
    bills = VendorBill.objects.filter(purchase_order__in=purchase_orders)
    VendorPayment.objects.filter(vendor_bill__in=bills).delete()
    bills.delete()
    GRNLine.objects.filter(goods_receipt__purchase_order__in=purchase_orders).delete()
    GoodsReceiptNote.objects.filter(purchase_order__in=purchase_orders).delete()
    purchase_orders.delete()
    suppliers.delete()


def _wipe_marketing_risk_audit(*, users) -> None:
    newsletter_emails = [f"{local_part}@{DEMO_DOMAIN}" for local_part, _ in NEWSLETTER_SIGNUPS]
    NewsletterSubscriber.objects.filter(email__in=newsletter_emails).delete()
    IPBlock.objects.filter(ip_address__in=[ip for ip, _ in DEMO_BLOCKED_IPS]).delete()
    PhoneBlock.objects.filter(
        phone_number__in=[phone for phone, _, _ in DEMO_BLOCKED_PHONES]
    ).delete()
    Coupon.objects.filter(code__in=[row[0] for row in DEMO_COUPONS]).delete()
    AuditLog.objects.filter(metadata__seed=AUDIT_MARKER).delete()
    # Failed attempts are recorded with user=None (nothing to attribute to yet),
    # so the email domain is the only thing that still ties them to this run.
    LoginHistory.objects.filter(
        models.Q(user__in=users) | models.Q(email__endswith=f"@{DEMO_DOMAIN}")
    ).delete()


def _wipe_config() -> None:
    # The shipping zones are fixed logistics fixtures, not demo data — only the
    # rates the seeder attached to the demo carriers are ours to wipe.
    carriers = Carrier.objects.filter(config__seed=CARRIER_MARKER)
    ShippingRate.objects.filter(carrier__in=carriers).delete()
    carriers.delete()
    TaxRate.objects.filter(name=TAX_RATE_NAME).delete()
    for code, _name, _type in EXTRA_ACCOUNTS:
        account = Account.objects.filter(code=code).first()
        if account is not None and not account.lines.exists():
            account.delete()


def _wipe_extras(*, variants) -> None:
    """Shop settings (profile, payment methods) are left alone: they hold no
    demo marker and a real shop may have edited them since."""
    BundleItem.objects.filter(bundle_variant__in=variants).delete()
    FraudCase.objects.filter(case_number__startswith=DEMO_FRAUD_CASE_PREFIX).delete()
    ExpenseCategory.objects.filter(description=EXPENSE_CATEGORY_NOTE).delete()
    for slide in HeroSlide.objects.filter(alt_text__startswith=HERO_ALT_PREFIX):
        slide.image.delete(save=False)
        slide.delete()
    PromoLine.objects.filter(text_en__in=[text for _, text, _ in PROMO_LINES]).delete()


@transaction.atomic
def wipe_demo_data() -> dict[str, int]:
    """Delete everything a previous `seed_demo` run created, matched by the
    markers in `constants.py`, and nothing else."""
    users = User.objects.filter(email__endswith=f"@{DEMO_DOMAIN}")
    orders = SalesOrder.objects.filter(customer__in=users)
    suppliers = Supplier.objects.filter(contact_email__endswith=f"@{DEMO_DOMAIN}")
    purchase_orders = PurchaseOrder.objects.filter(supplier__in=suppliers)
    variants = ProductVariant.objects.filter(sku__startswith=f"{SKU_PREFIX}-")
    products = Product.objects.filter(slug__startswith=SLUG_PREFIX)
    categories = Category.objects.filter(slug__startswith=SLUG_PREFIX)
    images = ProductImage.objects.filter(
        models.Q(product__in=products) | models.Q(variant__in=variants)
    )
    removed = {
        "orders": orders.count(),
        "product_images": images.count(),
        "variants": variants.count(),
        "users": users.count(),
        "purchase_orders": purchase_orders.count(),
    }

    reference_ids = _journal_reference_ids(
        orders=orders,
        purchase_orders=purchase_orders,
        variants=variants,
    )
    expenses = Expense.objects.filter(reference_number__startswith=EXPENSE_REF_PREFIX)
    expense_entry_ids = list(expenses.values_list("journal_entry_id", flat=True))
    expenses.delete()
    JournalEntry.objects.filter(reference_id__in=reference_ids).delete()
    JournalEntry.objects.filter(reference_type=OPENING_REFERENCE_TYPE).delete()
    JournalEntry.objects.filter(id__in=expense_entry_ids).delete()

    _wipe_orders(orders)
    _wipe_extras(variants=variants)
    _wipe_procurement(purchase_orders, suppliers)
    _wipe_marketing_risk_audit(users=users)

    StockLedgerEntry.objects.filter(variant__in=variants).delete()
    StockItem.objects.filter(variant__in=variants).delete()

    images.delete()
    variants.delete()
    products.delete()
    categories.delete()
    Brand.objects.filter(slug__startswith=SLUG_PREFIX).delete()

    Address.objects.filter(user__in=users).delete()
    users.delete()
    _wipe_config()

    return removed
