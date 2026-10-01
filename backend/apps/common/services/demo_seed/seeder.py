from __future__ import annotations

import random
from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.core.management import call_command
from django.utils import timezone
from django.utils.text import slugify

from apps.accounting.constants import ACCOUNT_CODES
from apps.accounting.models import Expense, JournalEntry, TaxRate
from apps.accounting.selectors.accounts import get_account_by_code
from apps.accounting.services.accounts import create_account, create_tax_rate
from apps.accounting.services.expenses import create_expense
from apps.accounting.services.journal import post_journal_entry
from apps.accounts.constants import UserRole
from apps.accounts.models import User
from apps.accounts.services.addresses import create_address
from apps.accounts.services.users import create_user
from apps.audit.models import AuditLog, LoginHistory
from apps.audit.services.audit import log_action, record_login_attempt
from apps.catalog.models import Category, Product, ProductImage, ProductVariant
from apps.catalog.services.categories import create_category
from apps.catalog.services.products import create_product, create_product_image, create_variant
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.services.demo_seed.constants import (
    AUDIT_IPS,
    AUDIT_MARKER,
    AUDIT_USER_AGENTS,
    BRAND,
    CARRIER_MARKER,
    CARRIERS,
    CATEGORIES,
    DELIVERY_AREAS,
    DELIVERY_NOTES,
    DEMO_BLOCKED_IPS,
    DEMO_BLOCKED_PHONES,
    DEMO_COUPONS,
    DEMO_DOMAIN,
    DEMO_PASSWORD,
    EXPENSE_REF_PREFIX,
    EXTRA_ACCOUNTS,
    FIRST_NAMES,
    LAST_NAMES,
    MONTHLY_EXPENSES,
    NEWSLETTER_SIGNUPS,
    OPENING_CAPITAL,
    OPENING_REFERENCE_TYPE,
    PAYMENT_METHODS,
    PRODUCTS,
    SHIPPING_RATE,
    SIZE_AXES,
    SKU_PREFIX,
    SLUG_PREFIX,
    SUPPLIERS,
    TAX_RATE_NAME,
    TAX_RATE_PERCENT,
)
from apps.inventory.constants import MovementType
from apps.inventory.models import StockItem, StockLedgerEntry
from apps.inventory.services.stock import post_adjustment, write_off_stock
from apps.logistics.models import Carrier, ShippingRate, ShippingZone
from apps.logistics.services.rates import create_carrier, create_rate
from apps.marketing.models import NewsletterSubscriber
from apps.marketing.services.subscribers import subscribe, unsubscribe
from apps.orders.constants import PaymentMethodKey
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
from apps.orders.services.carts import add_line, create_order
from apps.orders.services.checkout import checkout
from apps.orders.services.coupons import create_coupon
from apps.orders.services.orders import cancel_order
from apps.orders.services.payments import capture_payment, refund_payment
from apps.orders.services.returns import (
    approve_rma,
    create_rma,
    grade_rma_line,
    receive_rma,
    reject_rma,
)
from apps.orders.services.shipments import create_shipment, update_shipment_status
from apps.procurement.models import GRNLine, PurchaseOrder, Supplier, VendorBill
from apps.procurement.services.goods_receipt import create_goods_receipt
from apps.procurement.services.purchase_orders import (
    cancel_purchase_order,
    create_purchase_order,
    submit_purchase_order,
)
from apps.procurement.services.suppliers import create_supplier
from apps.procurement.services.vendor_bills import create_vendor_bill, record_vendor_payment
from apps.risk.models import IPBlock, PhoneBlock
from apps.risk.services.blocklist import block_phone
from apps.risk.services.ip_blocklist import block_ip

COST_RATIO = Decimal("0.45")
CENTS = Decimal("0.01")
LOW_STOCK_VARIANTS = 11
ZERO_STOCK_VARIANTS = 3
MAX_IMAGES_PER_PRODUCT = 3


def money(value) -> Decimal:
    return Decimal(value).quantize(CENTS, rounding=ROUND_HALF_UP)


class DemoSeeder:
    """Builds the whole LaunchCart demo dataset through the app's own
    services, then back-dates the rows the services stamp with `now`."""

    def __init__(self, *, orders: int, days: int, customers: int, seed: int, writer) -> None:
        self.rng = random.Random(seed)  # noqa: S311 -- deterministic demo data, not crypto
        self.target_orders = orders
        self.days = days
        self.customer_count = customers
        self.write = writer
        self.today = timezone.localdate()
        self.start_date = self.today - timedelta(days=days - 1)
        self.counts: dict[str, int] = {}
        self.availability: dict[tuple, int] = {}
        self.actor = User.objects.filter(is_superuser=True).order_by("date_joined").first()

    def run(self) -> dict[str, int]:
        self.seed_accounting_setup()
        self.seed_logistics()
        self.seed_catalog()
        self.seed_suppliers()
        self.seed_customers()
        self.post_opening_capital()
        self.seed_marketing()
        self.seed_risk_controls()
        self.seed_coupons()
        self.seed_procurement()
        self.seed_orders()
        self.seed_inventory_movements()
        self.seed_expenses()
        self.seed_audit_trail()
        return self.counts

    # ---- helpers -------------------------------------------------------

    def _bump(self, key: str, amount: int = 1) -> None:
        self.counts[key] = self.counts.get(key, 0) + amount

    def _moment(self, day: date, *, hour: int | None = None) -> datetime:
        hour = self.rng.randint(10, 21) if hour is None else hour
        naive = datetime.combine(day, time(hour=hour, minute=self.rng.randint(0, 59)))
        stamp = timezone.make_aware(naive)
        latest = timezone.now() - timedelta(minutes=5)
        return min(stamp, latest)

    def _retime_entries(self, reference_ids: list, entry_date: date) -> None:
        JournalEntry.objects.filter(reference_id__in=reference_ids).update(entry_date=entry_date)

    # ---- foundation ----------------------------------------------------

    def seed_accounting_setup(self) -> None:
        call_command("seed_chart_of_accounts", verbosity=0)
        for code, name, account_type in EXTRA_ACCOUNTS:
            if get_account_by_code(code) is None:
                create_account(code=code, name=name, type=account_type)
                self._bump("accounts")
        if not TaxRate.objects.filter(name=TAX_RATE_NAME).exists():
            create_tax_rate(
                name=TAX_RATE_NAME,
                rate_percent=Decimal(TAX_RATE_PERCENT),
                region="Bangladesh",
            )
            self._bump("tax_rates")

    def seed_logistics(self) -> None:
        self.carriers = []
        for name, code, phone in CARRIERS:
            carrier = Carrier.objects.filter(name=name).first()
            if carrier is None:
                carrier = create_carrier(
                    name=name,
                    code=code,
                    phone=phone,
                    contact_email=f"{code}.ops@{DEMO_DOMAIN}",
                    config={"seed": CARRIER_MARKER},
                )
                self._bump("carriers")
            self.carriers.append(carrier)

        # The zones themselves are fixed logistics fixtures, not demo data —
        # attach demo rates to every live zone so checkout can quote any
        # destination a seeded customer ships to.
        base_weight, base_charge, increment_weight, increment_charge = SHIPPING_RATE
        for zone in ShippingZone.objects.filter(deleted_at__isnull=True):
            for carrier in self.carriers:
                exists = ShippingRate.objects.filter(zone=zone, carrier=carrier).exists()
                if not exists:
                    create_rate(
                        zone=zone,
                        carrier=carrier,
                        base_weight=Decimal(base_weight),
                        base_charge=Decimal(base_charge),
                        increment_weight=Decimal(increment_weight),
                        increment_charge=Decimal(increment_charge),
                    )
                    self._bump("shipping_rates")

    def seed_catalog(self) -> None:
        categories: dict[str, Category] = {}
        for code, name, description in CATEGORIES:
            slug = f"{SLUG_PREFIX}{slugify(name)}"
            category = Category.objects.filter(slug=slug).first()
            if category is None:
                category = create_category(name=name, description=description)
                Category.objects.filter(pk=category.pk).update(slug=slug)
                category.slug = slug
                self._bump("categories")
            categories[code] = category

        variants: list[ProductVariant] = []
        barcode_seq = 1
        for index, (cat_code, name, price, axis, weight) in enumerate(PRODUCTS, start=1):
            product = self._ensure_product(categories[cat_code], name)
            self._ensure_product_images(product, categories[cat_code], index)
            labels = SIZE_AXES[axis][: 2 + (index % 3)]
            for label in labels:
                sku = f"{SKU_PREFIX}-{cat_code}-{index:02d}-{label.upper()[:3]}"
                barcode_seq += 1
                variant = ProductVariant.objects.filter(sku=sku).first()
                if variant is None:
                    variant = create_variant(
                        product=product,
                        sku=sku,
                        price=Decimal(price),
                        cost_price=money(Decimal(price) * COST_RATIO),
                        barcode=f"880{barcode_seq:010d}",
                        weight=Decimal(weight),
                        color=label if axis == "colour" else "",
                        size="" if axis == "colour" else label,
                    )
                    self._bump("variants")
                variants.append(variant)
        self.variants = variants
        self.sellable_variants = variants[:-LOW_STOCK_VARIANTS]
        self.scarce_variants = variants[-LOW_STOCK_VARIANTS:]

    def _ensure_product_images(self, product: Product, category: Category, index: int) -> None:
        # Seeded off the slug rather than the RNG so a re-run reproduces the
        # same URLs and the existence check below stays a no-op.
        existing = set(ProductImage.objects.filter(product=product).values_list("url", flat=True))
        for order in range(1 + index % MAX_IMAGES_PER_PRODUCT):
            token = product.slug if order == 0 else f"{product.slug}-{order + 1}"
            url = f"https://picsum.photos/seed/{token}/600/600"
            if url in existing:
                continue
            create_product_image(
                product=product,
                url=url,
                alt_text=f"{product.name} — {BRAND} {category.name.lower()}, view {order + 1}"[
                    :255
                ],
                sort_order=order,
            )
            self._bump("product_images")

    def _ensure_product(self, category: Category, name: str) -> Product:
        slug = f"{SLUG_PREFIX}{slugify(name)}"
        product = Product.objects.filter(slug=slug).first()
        if product is not None:
            return product
        product = create_product(
            category=category,
            name=name,
            description=(
                f"{name} from the {BRAND} {category.name.lower()} line — cut and finished "
                "for year-round wear in Bangladesh."
            ),
            product_type=Product.ProductType.VARIANT,
        )
        Product.objects.filter(pk=product.pk).update(slug=slug)
        product.slug = slug
        self._bump("products")
        return product

    def seed_suppliers(self) -> None:
        self.suppliers = []
        for name, handle, phone, terms in SUPPLIERS:
            email = f"{handle}@{DEMO_DOMAIN}"
            supplier = Supplier.objects.filter(contact_email=email).first()
            if supplier is None:
                supplier = create_supplier(
                    name=name, contact_email=email, phone=phone, payment_terms=terms
                )
                self._bump("suppliers")
            self.suppliers.append(supplier)

    def _demo_email(self, first: str, last: str, index: int) -> str:
        return f"{first}.{last}{index}@{DEMO_DOMAIN}".lower()

    def _phone(self) -> str:
        return f"+8801{self.rng.randint(3, 9)}{self.rng.randint(10000000, 99999999)}"

    def seed_customers(self) -> None:
        self.customers = []
        for index in range(1, self.customer_count + 1):
            first = FIRST_NAMES[index % len(FIRST_NAMES)]
            last = LAST_NAMES[(index * 3) % len(LAST_NAMES)]
            email = self._demo_email(first, last, index)
            user = User.objects.filter(email=email).first()
            if user is None:
                user = create_user(
                    email=email,
                    password=DEMO_PASSWORD,
                    role=UserRole.CUSTOMER,
                    first_name=first,
                    last_name=last,
                    phone=self._phone(),
                )
                self._bump("customers")
            if not user.addresses.exists():
                district, thana, postcode, street = DELIVERY_AREAS[index % len(DELIVERY_AREAS)]
                create_address(
                    user=user,
                    data={
                        "full_name": f"{first} {last}",
                        "phone": user.phone or self._phone(),
                        "line1": street,
                        "line2": DELIVERY_NOTES[index % len(DELIVERY_NOTES)],
                        "city": district,
                        "state": thana,
                        "postal_code": postcode,
                        "country": "Bangladesh",
                        "is_default": True,
                    },
                )
                self._bump("addresses")
            self.customers.append(user)

    def post_opening_capital(self) -> None:
        if JournalEntry.objects.filter(reference_type=OPENING_REFERENCE_TYPE).exists():
            return
        amount = Decimal(OPENING_CAPITAL)
        post_journal_entry(
            entry_date=self.start_date - timedelta(days=10),
            reference_type=OPENING_REFERENCE_TYPE,
            description=f"Opening capital injection — {BRAND}",
            lines=[
                {"account": get_account_by_code(ACCOUNT_CODES["bank"]), "debit": amount},
                {"account": get_account_by_code("3000"), "credit": amount},
            ],
        )
        self._bump("journal_entries")

    # ---- marketing / risk / coupons -------------------------------------

    def seed_marketing(self) -> None:
        for offset, (local_part, is_active) in enumerate(NEWSLETTER_SIGNUPS):
            email = f"{local_part}@{DEMO_DOMAIN}"
            if NewsletterSubscriber.objects.filter(email=email).exists():
                continue
            subscriber = subscribe(email=email)
            signed_up_at = self._moment(self.start_date + timedelta(days=offset))
            unsubscribed_at = None
            if not is_active:
                unsubscribe(email=email)
                unsubscribed_at = min(
                    signed_up_at + timedelta(days=3), timezone.now() - timedelta(minutes=5)
                )
            NewsletterSubscriber.objects.filter(pk=subscriber.pk).update(
                created_at=signed_up_at, unsubscribed_at=unsubscribed_at
            )
            self._bump("newsletter_subscribers")

    def seed_risk_controls(self) -> None:
        for index, (ip_address, reason) in enumerate(DEMO_BLOCKED_IPS):
            is_new = not IPBlock.objects.filter(ip_address=ip_address).exists()
            block = block_ip(ip_address, reason=reason, staff=self.actor)
            if is_new:
                stamp = self._moment(self.today - timedelta(days=14 + index * 3))
                IPBlock.objects.filter(pk=block.pk).update(created_at=stamp)
                self._bump("ip_blocks")

        for index, (phone_number, reason, strength) in enumerate(DEMO_BLOCKED_PHONES):
            is_new = not PhoneBlock.objects.filter(phone_number=phone_number).exists()
            block = block_phone(phone_number, reason=reason, strength=strength, staff=self.actor)
            if is_new:
                stamp = self._moment(self.today - timedelta(days=20 + index * 5))
                PhoneBlock.objects.filter(pk=block.pk).update(created_at=stamp)
                self._bump("phone_blocks")

    def seed_coupons(self) -> None:
        for code, discount_type, value, min_order_amount, usage_limit, expired in DEMO_COUPONS:
            if Coupon.objects.filter(code=code).exists():
                continue
            expiry_day = self.today - timedelta(days=5) if expired else self.today + timedelta(
                days=45
            )
            coupon = create_coupon(
                code=code,
                discount_type=discount_type,
                value=Decimal(value),
                min_order_amount=Decimal(min_order_amount),
                usage_limit=usage_limit,
                expires_at=timezone.make_aware(datetime.combine(expiry_day, time(23, 59))),
                is_active=not expired,
            )
            Coupon.objects.filter(pk=coupon.pk).update(
                created_at=self._moment(self.start_date, hour=9)
            )
            self._bump("coupons")

    # ---- procurement ---------------------------------------------------

    def _load_availability(self) -> None:
        for item in StockItem.objects.filter(variant__in=self.variants):
            self.availability[item.variant_id] = item.available

    def seed_procurement(self) -> None:
        if PurchaseOrder.objects.filter(supplier__in=self.suppliers).exists():
            return
        plans = [
            (self.variants[:60], (14, 30), self.suppliers[0]),
            (self.variants[60:], (14, 30), self.suppliers[1]),
            (self.sellable_variants[::3][:40], (8, 16), self.suppliers[2]),
            (self.sellable_variants[1::4][:30], (6, 12), self.suppliers[3]),
        ]
        received = []
        for index, (variants, quantity_range, supplier) in enumerate(plans):
            order_date = self.start_date - timedelta(days=26 - index * 4)
            purchase_order = self._stocking_purchase_order(
                variants=variants,
                quantity_range=quantity_range,
                supplier=supplier,
                order_date=order_date,
            )
            self._receive_fully(purchase_order, order_date + timedelta(days=5))
            received.append(purchase_order)
        self._seed_open_purchase_orders()
        self._seed_vendor_bills(received)

    def _stocking_purchase_order(
        self, *, variants, quantity_range, supplier, order_date
    ) -> PurchaseOrder:
        lines = [
            {
                "variant": variant,
                "quantity_ordered": self.rng.randint(*quantity_range),
                "unit_cost": variant.cost_price,
            }
            for variant in variants
        ]
        purchase_order = create_purchase_order(
            supplier=supplier,
            order_date=order_date,
            notes="Season intake",
            lines=lines,
        )
        submit_purchase_order(purchase_order=purchase_order)
        PurchaseOrder.objects.filter(pk=purchase_order.pk).update(
            created_at=self._moment(order_date, hour=11)
        )
        self._bump("purchase_orders")
        return purchase_order

    def _receive_fully(self, purchase_order: PurchaseOrder, received_date: date) -> None:
        grn = create_goods_receipt(
            purchase_order=purchase_order,
            received_date=received_date,
            received_by=self.actor,
            lines=[
                {
                    "purchase_order_line": line,
                    "quantity_received": line.quantity_ordered,
                    "condition": GRNLine.Condition.ACCEPTED,
                }
                for line in purchase_order.lines.all()
            ],
        )
        stamp = self._moment(received_date, hour=9)
        StockLedgerEntry.objects.filter(reference_id=grn.id).update(created_at=stamp)
        self._bump("goods_receipts")

    def _seed_open_purchase_orders(self) -> None:
        pool = self.sellable_variants
        draft = create_purchase_order(
            supplier=self.suppliers[4],
            order_date=self.today - timedelta(days=3),
            notes="Winter accessories top-up — awaiting approval",
            lines=self._po_lines(pool[10:18], (20, 40)),
        )
        submitted = create_purchase_order(
            supplier=self.suppliers[1],
            order_date=self.today - timedelta(days=11),
            notes="Panjabi restock ahead of the wedding season",
            lines=self._po_lines(pool[20:30], (25, 50)),
        )
        submit_purchase_order(purchase_order=submitted)
        cancelled = create_purchase_order(
            supplier=self.suppliers[3],
            order_date=self.today - timedelta(days=24),
            notes="Cancelled — supplier could not confirm the delivery window",
            lines=self._po_lines(pool[40:46], (15, 25)),
        )
        cancel_purchase_order(purchase_order=cancelled)
        partial = create_purchase_order(
            supplier=self.suppliers[2],
            order_date=self.today - timedelta(days=18),
            notes="Split delivery — first consignment received",
            lines=self._po_lines(pool[50:56], (30, 45)),
        )
        submit_purchase_order(purchase_order=partial)
        create_goods_receipt(
            purchase_order=partial,
            received_date=self.today - timedelta(days=12),
            received_by=self.actor,
            lines=[
                {
                    "purchase_order_line": line,
                    "quantity_received": max(line.quantity_ordered // 2, 1),
                    "condition": GRNLine.Condition.ACCEPTED,
                }
                for line in partial.lines.all()
            ],
        )
        self.partial_purchase_order = partial
        self._bump("purchase_orders", 4)
        self._bump("goods_receipts")
        for purchase_order in (draft, submitted, cancelled, partial):
            PurchaseOrder.objects.filter(pk=purchase_order.pk).update(
                created_at=self._moment(purchase_order.order_date, hour=12)
            )

    def _po_lines(self, variants, quantity_range) -> list[dict]:
        return [
            {
                "variant": variant,
                "quantity_ordered": self.rng.randint(*quantity_range),
                "unit_cost": variant.cost_price,
            }
            for variant in variants
        ]

    def _bill_amount(self, purchase_order: PurchaseOrder) -> Decimal:
        return money(
            sum(
                (line.unit_cost * line.quantity_received for line in purchase_order.lines.all()),
                Decimal("0"),
            )
        )

    def _seed_vendor_bills(self, received: list[PurchaseOrder]) -> None:
        billable = [*received, self.partial_purchase_order]
        for index, purchase_order in enumerate(billable):
            amount = self._bill_amount(purchase_order)
            if amount <= 0:
                continue
            due_date = purchase_order.order_date + timedelta(days=35)
            bill = create_vendor_bill(
                purchase_order=purchase_order,
                supplier=purchase_order.supplier,
                amount=amount,
                due_date=due_date,
            )
            self._bump("vendor_bills")
            self._pay_bill(bill, index, due_date)

    def _pay_bill(self, bill: VendorBill, index: int, due_date: date) -> None:
        paid_at = self._moment(min(due_date, self.today - timedelta(days=2)), hour=14)
        if index == 0:
            record_vendor_payment(
                vendor_bill=bill,
                amount=bill.amount,
                paid_at=paid_at,
                method="Bank transfer",
                reference=f"BEFTN-{self.rng.randint(100000, 999999)}",
            )
            self._bump("vendor_payments")
        elif index == 1:
            half = money(bill.amount / 2)
            record_vendor_payment(
                vendor_bill=bill,
                amount=half,
                paid_at=paid_at,
                method="Cheque",
                reference=f"CHQ-{self.rng.randint(100000, 999999)}",
            )
            record_vendor_payment(
                vendor_bill=bill,
                amount=bill.amount - half,
                paid_at=paid_at + timedelta(days=1),
                method="Bank transfer",
                reference=f"BEFTN-{self.rng.randint(100000, 999999)}",
            )
            self._bump("vendor_payments", 2)
        elif index == 2:
            record_vendor_payment(
                vendor_bill=bill,
                amount=money(bill.amount * Decimal("0.4")),
                paid_at=paid_at,
                method="Bank transfer",
                reference=f"BEFTN-{self.rng.randint(100000, 999999)}",
            )
            self._bump("vendor_payments")
        elif index == 3:
            VendorBill.objects.filter(pk=bill.pk).update(status=VendorBill.Status.OVERDUE)

    # ---- sales ---------------------------------------------------------

    def _order_schedule(self) -> list[date]:
        weights = []
        for offset in range(self.days):
            day = self.start_date + timedelta(days=offset)
            weight = 1.0 + 1.8 * offset / self.days
            if day.weekday() in (3, 4):
                weight *= 1.8
            if 60 <= offset < 72:
                weight *= 2.4
            weights.append(weight)
        offsets = sorted(self.rng.choices(range(self.days), weights=weights, k=self.target_orders))
        return [self.start_date + timedelta(days=offset) for offset in offsets]

    def _status_for(self, age: int) -> str:
        if age > 25:
            return self.rng.choices(
                ["delivered", "closed", "shipped", "cancelled", "confirmed"],
                weights=[62, 6, 12, 12, 8],
            )[0]
        if age > 10:
            return self.rng.choices(
                ["shipped", "delivered", "confirmed", "partial", "cancelled", "awaiting"],
                weights=[26, 24, 18, 14, 10, 8],
            )[0]
        return self.rng.choices(
            ["pending", "awaiting", "confirmed", "partial", "shipped", "cancelled"],
            weights=[14, 12, 26, 18, 25, 5],
        )[0]

    def seed_orders(self) -> None:
        self._load_availability()
        self.paid_orders: list[SalesOrder] = []
        self.delivered_orders: list[SalesOrder] = []
        if SalesOrder.objects.filter(customer__in=self.customers).count() >= self.target_orders:
            return
        for day in self._order_schedule():
            status = self._status_for((self.today - day).days)
            self._build_order(ordered_at=self._moment(day), status=status)
        self._seed_returns()
        self._seed_refund()

    def _pick_line(self) -> tuple[ProductVariant, int] | None:
        for _attempt in range(12):
            variant = self.rng.choice(self.sellable_variants)
            quantity = self.rng.randint(1, 3)
            if self.availability.get(variant.id, 0) >= quantity:
                self.availability[variant.id] -= quantity
                return variant, quantity
        return None

    def _add_order_lines(self, order: SalesOrder) -> int:
        added = 0
        for _index in range(self.rng.randint(2, 5)):
            picked = self._pick_line()
            if picked is None:
                continue
            variant, quantity = picked
            add_line(order=order, variant=variant, quantity=quantity)
            added += 1
        return added

    def _build_order(self, *, ordered_at: datetime, status: str) -> None:
        customer = self.rng.choice(self.customers)
        order = create_order(customer=customer, created_by=self.actor)
        if not self._add_order_lines(order):
            SalesOrder.objects.filter(pk=order.pk).delete()
            return
        order.refresh_from_db()
        self._bump("sales_orders")
        if status == "pending":
            self._backdate_order(order=order, ordered_at=ordered_at)
            return
        address = customer.addresses.filter(deleted_at__isnull=True).first()
        try:
            checkout(order=order, shipping_address=address, carrier=self.rng.choice(self.carriers))
        except BusinessRuleViolationError:
            self._backdate_order(order=order, ordered_at=ordered_at)
            return
        order.refresh_from_db()
        self._advance_order(order=order, ordered_at=ordered_at, status=status)

    def _advance_order(self, *, order: SalesOrder, ordered_at: datetime, status: str) -> None:
        if status == "awaiting":
            self._record_pending_payment(order)
            self._backdate_order(order=order, ordered_at=ordered_at)
            return

        method = self.rng.choice(PAYMENT_METHODS)
        # COD/cash/manual need no reference; everything else does — same
        # style TRX reference _record_pending_payment already uses below.
        reference = f"TRX{self.rng.randint(10**9, 10**10 - 1)}"
        payment = capture_payment(
            order=order, amount=order.grand_total, method=method, reference=reference
        )
        self._bump("payments")
        order.refresh_from_db()

        if status == "cancelled":
            cancel_order(order=order, actor=self.actor)
            self._backdate_order(order=order, ordered_at=ordered_at, payment=payment)
            return
        if status == "confirmed":
            self._backdate_order(order=order, ordered_at=ordered_at, payment=payment)
            self.paid_orders.append(order)
            return

        shipped_day = min(ordered_at.date() + timedelta(days=self.rng.randint(1, 3)), self.today)
        shipped_at = max(self._moment(shipped_day), ordered_at + timedelta(hours=3))
        shipment = self._create_shipment(order=order, method=method, partial=status == "partial")
        self._bump("shipments")

        delivered_at = None
        if status in {"delivered", "closed"}:
            update_shipment_status(
                shipment=shipment, status=Shipment.Status.DELIVERED, actor=self.actor
            )
            delivered_day = min(
                shipped_at.date() + timedelta(days=self.rng.randint(1, 4)), self.today
            )
            delivered_at = max(self._moment(delivered_day), shipped_at + timedelta(hours=6))
            final = SalesOrder.Status.CLOSED if status == "closed" else SalesOrder.Status.DELIVERED
            SalesOrder.objects.filter(pk=order.pk).update(status=final)
            order.refresh_from_db()
            self.delivered_orders.append(order)
        elif status == "shipped":
            update_shipment_status(
                shipment=shipment, status=Shipment.Status.IN_TRANSIT, actor=self.actor
            )

        self._backdate_order(
            order=order,
            ordered_at=ordered_at,
            payment=payment,
            shipment=shipment,
            shipped_at=shipped_at,
            delivered_at=delivered_at,
        )
        self.paid_orders.append(order)

    def _record_pending_payment(self, order: SalesOrder) -> None:
        """Constructed directly, not captured: an uncollected payment must not
        move cash on the ledger, and `capture_payment` always posts one."""
        Payment.objects.create(
            order=order,
            amount=order.grand_total,
            method=self.rng.choice(PAYMENT_METHODS),
            status=Payment.Status.PENDING,
            gateway_reference=f"TRX{self.rng.randint(10**9, 10**10 - 1)}",
        )
        self._bump("payments")

    def _shipment_payload(self, order: SalesOrder, *, partial: bool) -> list[dict]:
        lines = list(order.lines.all())
        full = [{"order_line": line, "quantity": line.quantity} for line in lines]
        if not partial:
            return full
        payload = [{"order_line": line, "quantity": max(line.quantity // 2, 1)} for line in lines]
        if all(item["quantity"] == item["order_line"].quantity for item in payload):
            payload = payload[:-1]
        return payload or full

    def _create_shipment(self, *, order: SalesOrder, method: str, partial: bool) -> Shipment:
        carrier = self.rng.choice(self.carriers)
        return create_shipment(
            order=order,
            lines=self._shipment_payload(order, partial=partial),
            carrier=carrier,
            tracking_number=f"{carrier.code.upper()}{self.rng.randint(10**8, 10**9 - 1)}",
            shipping_charge=order.shipping_total,
            cod_amount=order.grand_total if method == PaymentMethodKey.COD else Decimal("0"),
        )

    def _backdate_order(
        self,
        *,
        order: SalesOrder,
        ordered_at: datetime,
        payment: Payment | None = None,
        shipment: Shipment | None = None,
        shipped_at: datetime | None = None,
        delivered_at: datetime | None = None,
    ) -> None:
        SalesOrder.objects.filter(pk=order.pk).update(created_at=ordered_at)
        SalesOrderLine.objects.filter(order=order).update(created_at=ordered_at)
        StockReservation.objects.filter(order_line__order=order).update(created_at=ordered_at)
        if payment is not None:
            Payment.objects.filter(pk=payment.pk).update(created_at=ordered_at)
            self._retime_entries([payment.id], ordered_at.date())
        if shipment is not None and shipped_at is not None:
            Shipment.objects.filter(pk=shipment.pk).update(
                created_at=shipped_at, shipped_at=shipped_at, delivered_at=delivered_at
            )
            ShipmentLine.objects.filter(shipment=shipment).update(created_at=shipped_at)
            StockLedgerEntry.objects.filter(reference_id=shipment.id).update(created_at=shipped_at)
            self._retime_entries([shipment.id], shipped_at.date())

    RETURN_PLANS = (
        ("received", ReturnRMALine.Condition.SELLABLE),
        ("received", ReturnRMALine.Condition.DAMAGED),
        ("received", ReturnRMALine.Condition.SELLABLE),
        ("approved", ReturnRMALine.Condition.SELLABLE),
        ("requested", None),
        ("rejected", None),
    )

    RETURN_REASONS = (
        "Size did not fit — customer requested an exchange.",
        "Stitching defect reported on arrival.",
        "Colour differed from the product photo.",
        "Customer changed their mind within the return window.",
    )

    def _seed_returns(self) -> None:
        candidates = [
            order for order in self.delivered_orders if order.lines.filter(shipped_quantity__gt=0)
        ]
        self.rng.shuffle(candidates)
        for order, (plan, condition) in zip(candidates, self.RETURN_PLANS, strict=False):
            line = order.lines.filter(shipped_quantity__gt=0).first()
            if line is None or line.returnable_quantity < 1:
                continue
            rma = create_rma(
                order=order,
                lines=[{"order_line": line, "quantity": 1}],
                reason=self.rng.choice(self.RETURN_REASONS),
            )
            self._bump("returns")
            self._advance_rma(rma, plan, condition)
            stamp = min(
                order.created_at + timedelta(days=self.rng.randint(6, 14)),
                timezone.now() - timedelta(minutes=5),
            )
            ReturnRMA.objects.filter(pk=rma.pk).update(created_at=stamp)
            ReturnRMALine.objects.filter(rma=rma).update(created_at=stamp)
            StockLedgerEntry.objects.filter(reference_id=rma.id).update(created_at=stamp)
            self._retime_entries([rma.id], stamp.date())

    def _advance_rma(self, rma: ReturnRMA, plan: str, condition: str | None) -> None:
        if plan == "requested":
            return
        if plan == "rejected":
            reject_rma(rma=rma)
            return
        approve_rma(rma=rma)
        if plan == "approved":
            return
        for line in rma.lines.all():
            grade_rma_line(line=line, condition=condition)
        receive_rma(rma=rma, actor=self.actor)

    def _seed_refund(self) -> None:
        payment = (
            Payment.objects.filter(order__in=self.paid_orders, status=Payment.Status.CAPTURED)
            .order_by("created_at")
            .first()
        )
        if payment is None:
            return
        refund_payment(payment=payment, actor=self.actor)
        self._retime_entries([payment.id], payment.created_at.date())
        self._bump("refunds")

    # ---- inventory shaping ---------------------------------------------

    def seed_inventory_movements(self) -> None:
        self._set_reorder_points()
        self._seed_write_offs()
        self._shape_low_stock()

    def _set_reorder_points(self) -> None:
        scarce_ids = {variant.id for variant in self.scarce_variants}
        updates = []
        for item in StockItem.objects.filter(variant__in=self.variants):
            if item.variant_id in scarce_ids:
                item.reorder_point = 15
                item.target_stock_level = 60
            else:
                item.reorder_point = 8
                item.target_stock_level = 40
            updates.append(item)
        StockItem.objects.bulk_update(updates, ["reorder_point", "target_stock_level"])
        self._bump("stock_items", len(updates))

    def _has_movement(self, movement_type: str) -> bool:
        return StockLedgerEntry.objects.filter(
            movement_type=movement_type, variant__in=self.variants
        ).exists()

    def _seed_write_offs(self) -> None:
        if self._has_movement(MovementType.WRITE_OFF):
            return
        reasons = ["Monsoon water damage in transit", "Torn packaging, unsellable"]
        for variant, reason in zip(self.sellable_variants[20:22], reasons, strict=False):
            try:
                entry = write_off_stock(
                    variant=variant, quantity=2, reason=reason, actor=self.actor
                )
            except BusinessRuleViolationError:
                continue
            stamp = self._moment(self.today - timedelta(days=21), hour=15)
            StockLedgerEntry.objects.filter(pk=entry.pk).update(created_at=stamp)
            self._retime_entries([entry.id], stamp.date())
            self._bump("write_offs")

    def _shape_low_stock(self) -> None:
        for index, variant in enumerate(self.scarce_variants):
            item = StockItem.objects.filter(variant=variant).first()
            if item is None:
                continue
            # Fixed per position rather than random, so a re-run converges on
            # the same shelf quantities instead of drifting.
            target = 0 if index < ZERO_STOCK_VARIANTS else 2 + (index * 3) % 11
            delta = target - item.quantity_on_hand
            if delta == 0:
                continue
            post_adjustment(
                variant=variant,
                quantity_delta=delta,
                notes="Cycle count correction",
                actor=self.actor,
            )
            self._bump("stock_adjustments")

    # ---- expenses --------------------------------------------------------

    def _recent_periods(self, count: int) -> list[date]:
        cursor = self.today.replace(day=1)
        periods = []
        for _index in range(count):
            cursor = (cursor - timedelta(days=1)).replace(day=1)
            periods.append(cursor)
        return list(reversed(periods))

    def seed_expenses(self) -> None:
        bank = get_account_by_code(ACCOUNT_CODES["bank"])
        sequence = 0
        for period in self._recent_periods(4):
            for code, payee, amount, description in MONTHLY_EXPENSES:
                sequence += 1
                reference = f"{EXPENSE_REF_PREFIX}{sequence:04d}"
                if Expense.objects.filter(reference_number=reference).exists():
                    continue
                create_expense(
                    expense_date=period.replace(day=5),
                    payee=payee,
                    amount=Decimal(amount),
                    expense_account=get_account_by_code(code),
                    payment_account=bank,
                    description=description,
                    reference_number=reference,
                )
                self._bump("expenses")

    # ---- audit trail -----------------------------------------------------

    def seed_audit_trail(self) -> None:
        self._seed_login_history()
        self._seed_admin_audit_log()

    def _seed_login_history(self) -> None:
        sample = self.customers[: min(8, len(self.customers))]
        if not sample or LoginHistory.objects.filter(user__in=sample).exists():
            return
        for index, user in enumerate(sample):
            day = self.today - timedelta(days=(index + 1) * 2)
            ip_address = AUDIT_IPS[index % len(AUDIT_IPS)]
            user_agent = AUDIT_USER_AGENTS[index % len(AUDIT_USER_AGENTS)]
            if index % 4 == 0:
                failed = record_login_attempt(
                    email=user.email,
                    was_successful=False,
                    ip_address=ip_address,
                    user_agent=user_agent,
                )
                LoginHistory.objects.filter(pk=failed.pk).update(
                    created_at=self._moment(day, hour=9)
                )
                self._bump("login_history")
            success = record_login_attempt(
                user=user,
                email=user.email,
                was_successful=True,
                ip_address=ip_address,
                user_agent=user_agent,
            )
            LoginHistory.objects.filter(pk=success.pk).update(
                created_at=self._moment(day, hour=10)
            )
            self._bump("login_history")

    def _admin_audit_targets(self) -> list[tuple[str, str, object, dict]]:
        targets: list[tuple[str, str, object, dict]] = []
        product = Product.objects.filter(slug__startswith=SLUG_PREFIX).first()
        if product is not None:
            targets.append(
                ("product.updated", "Product", product.id, {"field": "description"})
            )
        coupon = Coupon.objects.filter(code__in=[row[0] for row in DEMO_COUPONS]).first()
        if coupon is not None:
            targets.append(("coupon.created", "Coupon", coupon.id, {"code": coupon.code}))
        order = self.paid_orders[0] if getattr(self, "paid_orders", None) else None
        if order is not None:
            targets.append(
                ("order.status_changed", "SalesOrder", order.id, {"status": order.status})
            )
        ip_block = IPBlock.objects.filter(
            ip_address__in=[ip for ip, _ in DEMO_BLOCKED_IPS]
        ).first()
        if ip_block is not None:
            targets.append(
                ("risk.ip_blocked", "IPBlock", ip_block.id, {"ip_address": ip_block.ip_address})
            )
        phone_block = PhoneBlock.objects.filter(
            phone_number__in=[phone for phone, _, _ in DEMO_BLOCKED_PHONES]
        ).first()
        if phone_block is not None:
            targets.append(
                (
                    "risk.phone_blocked",
                    "PhoneBlock",
                    phone_block.id,
                    {"phone_number": phone_block.phone_number},
                )
            )
        return targets

    def _seed_admin_audit_log(self) -> None:
        if AuditLog.objects.filter(metadata__seed=AUDIT_MARKER).exists():
            return
        for index, (action, target_type, target_id, extra) in enumerate(
            self._admin_audit_targets()
        ):
            entry = log_action(
                actor=self.actor,
                action=action,
                target_type=target_type,
                target_id=target_id,
                metadata={"seed": AUDIT_MARKER, **extra},
                ip_address=AUDIT_IPS[index % len(AUDIT_IPS)],
                user_agent=AUDIT_USER_AGENTS[index % len(AUDIT_USER_AGENTS)],
            )
            stamp = self._moment(self.today - timedelta(days=index + 1), hour=11)
            AuditLog.objects.filter(pk=entry.pk).update(created_at=stamp)
            self._bump("audit_logs")
