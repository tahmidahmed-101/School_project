"""The parts of the demo dataset the storefront and dashboard need beyond the
trading history: logins, shop settings, home page content, pre-orders and
customer feedback. Runs after `DemoSeeder` and reuses its customers, variants
and carriers."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from io import BytesIO

from django.core.files.base import ContentFile
from django.utils import timezone
from django.utils.text import slugify
from PIL import Image

from apps.accounting.models import Expense, ExpenseCategory
from apps.accounting.services.expense_categories import create_expense_category
from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.models import User
from apps.accounts.services.staff_permissions import set_staff_permissions
from apps.accounts.services.users import create_user
from apps.business.models import BusinessProfile, HeroSlide, PromoLine
from apps.business.selectors.business_profile import get_business_profile
from apps.business.services.storefront_content import create_hero_slide, create_promo_line
from apps.catalog.models import (
    Brand,
    Category,
    PriceIssueReport,
    Product,
    ProductQuestion,
    ProductReview,
    ProductVariant,
    Sale,
    WishlistItem,
)
from apps.catalog.services.brands import create_brand
from apps.catalog.services.bundles import create_bundle
from apps.catalog.services.categories import create_category
from apps.catalog.services.price_reports import report_price_issue, update_price_report
from apps.catalog.services.products import create_product, create_product_image, create_variant
from apps.catalog.services.questions import ask_question, moderate_question
from apps.catalog.services.reviews import create_review
from apps.catalog.services.sales import create_sale
from apps.catalog.services.wishlist import add_to_wishlist
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.params import KIND_PREORDER, KINDS
from apps.common.services.demo_seed.constants import (
    BUNDLE_NAME,
    BUNDLE_SKU,
    DEMO_BRANDS,
    DEMO_DEPOSIT_PERCENT,
    DEMO_DISCOUNT_NAMES,
    DEMO_DOMAIN,
    DEMO_FRAUD_CASE_PREFIX,
    DEMO_PASSWORD,
    DEMO_PAY_TO,
    DEMO_SALE_CATEGORY,
    DEMO_SALE_PERCENT,
    DEMO_STOREFRONT_METHODS,
    DEMO_TEAM,
    EXPENSE_CATEGORY_NOTE,
    EXPENSE_REF_PREFIX,
    HERO_ALT_PREFIX,
    HERO_SLIDES,
    PREORDER_CATEGORY,
    PREORDER_PRODUCTS,
    PRICE_REPORT_COMMENTS,
    PROMO_LINES,
    QUESTIONS,
    REVIEW_COMMENTS,
    SKU_PREFIX,
    SLUG_PREFIX,
)
from apps.inventory.constants import MovementType
from apps.inventory.selectors.warehouse import get_or_create_default_warehouse
from apps.inventory.services.stock import record_movement
from apps.orders.constants import PaymentMethodKey
from apps.orders.models import PaymentMethodSetting, SalesOrder, SalesOrderLine
from apps.orders.models.preorder_stage import PreorderStage
from apps.orders.selectors.payments import order_deposit_due
from apps.orders.services.carts import add_line, create_order
from apps.orders.services.checkout import checkout
from apps.orders.services.payment_methods import (
    set_payment_method_enabled,
    set_payment_method_pay_to,
)
from apps.orders.services.payments import capture_payment, record_payment_due
from apps.orders.services.preorder import set_preorder_stage
from apps.orders.services.preorder_allocation import allocate_preorder_stock
from apps.orders.services.shipments import create_shipment
from apps.risk.models import FraudCase

HERO_SIZE = (1600, 640)


class DemoExtras:
    def __init__(self, seeder) -> None:
        self.seeder = seeder
        self.rng = seeder.rng
        self.customers = seeder.customers
        self.carriers = seeder.carriers
        self.bump = seeder._bump

    def run(self) -> None:
        self.seed_team()
        self.seed_shop_settings()
        self.seed_home_content()
        self.seed_bundle()
        self.seed_preorders()
        self.seed_brands()
        self.seed_feedback()
        self.seed_expense_categories()
        self.seed_fraud_cases()
        self.seed_sale()

    # ---- logins and settings ---------------------------------------------

    def seed_team(self) -> None:
        self.admin = None
        for handle, first, last, role in DEMO_TEAM:
            email = f"{handle}@{DEMO_DOMAIN}"
            user = User.objects.filter(email=email).first()
            if user is None:
                user = create_user(
                    email=email,
                    password=DEMO_PASSWORD,
                    role=role,
                    first_name=first,
                    last_name=last,
                    is_active=True,
                )
                self.bump("team_logins")
            if role == UserRole.ADMIN:
                self.admin = user
            elif not user.staff_permissions.exists():
                set_staff_permissions(
                    staff_user=user,
                    permission_updates=[
                        {"code": code, "is_enabled": True} for code in StaffPermissionCode.values
                    ],
                    granted_by=self.admin,
                )

    def seed_shop_settings(self) -> None:
        # A shop that already has a profile keeps its own deposit setting.
        fresh_profile = not BusinessProfile.objects.exists()
        profile = get_business_profile()
        if fresh_profile:
            profile.preorder_deposit_percent = Decimal(DEMO_DEPOSIT_PERCENT)
            profile.save(update_fields=["preorder_deposit_percent"])
        if PaymentMethodSetting.objects.exists():
            return
        for kind in KINDS:
            for key in DEMO_STOREFRONT_METHODS:
                set_payment_method_enabled(key=key, is_enabled=True, kind=kind)
                if key in DEMO_PAY_TO:
                    set_payment_method_pay_to(key=key, pay_to=DEMO_PAY_TO[key], kind=kind)
                self.bump("payment_methods")

    def seed_home_content(self) -> None:
        if not HeroSlide.objects.exists():
            for index, (placement, colour, tag_en, tag_bn, title_en, title_bn, link) in enumerate(
                HERO_SLIDES, start=1
            ):
                buffer = BytesIO()
                Image.new("RGB", HERO_SIZE, colour).save(buffer, format="JPEG", quality=80)
                create_hero_slide(
                    data={
                        "image": ContentFile(buffer.getvalue(), name=f"demo-hero-{index}.jpg"),
                        "alt_text": f"{HERO_ALT_PREFIX} {index}",
                        "tag_en": tag_en,
                        "tag_bn": tag_bn,
                        "title_en": title_en,
                        "title_bn": title_bn,
                        "link_url": link,
                        "placement": placement,
                        "sort_order": index,
                    }
                )
                self.bump("hero_slides")
        if not PromoLine.objects.exists():
            for index, (placement, text_en, text_bn) in enumerate(PROMO_LINES, start=1):
                create_promo_line(
                    data={
                        "text_en": text_en,
                        "text_bn": text_bn,
                        "placement": placement,
                        "sort_order": index,
                    }
                )
                self.bump("promo_lines")

    # ---- catalogue ---------------------------------------------------------

    def seed_brands(self) -> None:
        brands: dict[str, list[Brand]] = {}
        for name, description, kind in DEMO_BRANDS:
            slug = f"{SLUG_PREFIX}{slugify(name)}"
            brand = Brand.objects.filter(slug=slug).first()
            if brand is None:
                brand = create_brand(
                    name=name, description=description, kind=kind, actor=self.admin
                )
                Brand.objects.filter(pk=brand.pk).update(slug=slug)
                self.bump("brands")
            brands.setdefault(brand.kind, []).append(brand)
        unbranded = Product.objects.filter(slug__startswith=SLUG_PREFIX, brand__isnull=True)
        rows = unbranded.values_list("id", "category__category_type")
        for index, (product_id, kind) in enumerate(rows):
            choices = brands[kind]
            Product.objects.filter(pk=product_id).update(brand=choices[index % len(choices)])

    def seed_bundle(self) -> None:
        if ProductVariant.objects.filter(sku=BUNDLE_SKU).exists():
            return
        first, second = self.seeder.sellable_variants[0], self.seeder.sellable_variants[5]
        try:
            bundle = create_bundle(
                category=first.product.category,
                name=BUNDLE_NAME,
                sku=BUNDLE_SKU,
                components=[
                    {"component_variant_id": str(first.id), "quantity": 1},
                    {"component_variant_id": str(second.id), "quantity": 1},
                ],
                discount_price=((first.price + second.price) * Decimal("0.9")).quantize(
                    Decimal("1")
                ),
                actor=self.admin,
            )
        except BusinessRuleViolationError as exc:
            self.seeder.write(f"Bundle skipped: {exc}")
            return
        slug = f"{SLUG_PREFIX}{slugify(BUNDLE_NAME)}"
        Product.objects.filter(pk=bundle.product_id).update(slug=slug)
        create_product_image(
            product=bundle.product,
            url=f"https://picsum.photos/seed/{slug}/600/600",
            alt_text=BUNDLE_NAME,
            sort_order=0,
        )
        self.bump("bundles")

    # ---- pre-orders --------------------------------------------------------

    def _preorder_variants(self) -> dict[str, ProductVariant]:
        name, description = PREORDER_CATEGORY
        slug = f"{SLUG_PREFIX}{slugify(name)}"
        category = Category.objects.filter(slug=slug).first()
        if category is None:
            category = create_category(
                name=name,
                description=description,
                category_type=Category.CategoryType.PREORDER,
            )
            Category.objects.filter(pk=category.pk).update(slug=slug)
            self.bump("categories")
        now = timezone.now()
        variants: dict[str, ProductVariant] = {}
        for index, (product_name, price, state) in enumerate(PREORDER_PRODUCTS, start=1):
            sku = f"{SKU_PREFIX}-PRE-{index:02d}"
            variant = ProductVariant.objects.filter(sku=sku).first()
            if variant is None:
                product_slug = f"{SLUG_PREFIX}{slugify(product_name)}"
                product = create_product(
                    category=category,
                    name=product_name,
                    description=f"{product_name}, brought in on pre-order.",
                    product_type=Product.ProductType.VARIANT,
                )
                Product.objects.filter(pk=product.pk).update(slug=product_slug)
                create_product_image(
                    product=product,
                    url=f"https://picsum.photos/seed/{product_slug}/600/600",
                    alt_text=product_name,
                    sort_order=0,
                )
                opens = now - timedelta(days=3) if state == "open" else now + timedelta(days=7)
                variant = create_variant(
                    product=product,
                    sku=sku,
                    price=Decimal(price),
                    cost_price=(Decimal(price) * Decimal("0.6")).quantize(Decimal("0.01")),
                    is_preorder_enabled=True,
                    preorder_start_date=opens,
                    preorder_end_date=opens + timedelta(days=30),
                    preorder_stock_limit=50,
                    actor=self.admin,
                )
                self.bump("preorder_variants")
            variants[sku[-2:]] = variant
        return variants

    def _place_preorder(self, variant: ProductVariant, quantity: int) -> SalesOrder:
        customer = self.rng.choice(self.customers)
        order = create_order(customer=customer, created_by=self.admin)
        add_line(order=order, variant=variant, quantity=quantity)
        try:
            checkout(
                order=order,
                shipping_address=customer.addresses.filter(deleted_at__isnull=True).first(),
                carrier=self.rng.choice(self.carriers),
            )
        except BusinessRuleViolationError:
            SalesOrder.objects.filter(pk=order.pk).delete()
            raise
        order.refresh_from_db()
        record_payment_due(order=order, method=PaymentMethodKey.BKASH)
        self.bump("preorder_orders")
        return order

    def _pay_deposit(self, order: SalesOrder) -> SalesOrder:
        capture_payment(
            order=order,
            amount=order_deposit_due(order),
            method=PaymentMethodKey.BKASH,
            reference=f"DEMO-{order.order_number}",
        )
        order.refresh_from_db()
        return order

    def seed_preorders(self) -> None:
        variants = self._preorder_variants()
        if SalesOrder.objects.filter(
            customer__in=self.customers, order_type=SalesOrder.OrderType.PREORDER
        ).exists():
            return
        arrived, waiting, unpaid = variants["01"], variants["02"], variants["03"]

        try:
            first = self._place_preorder(arrived, 1)
        except BusinessRuleViolationError as exc:
            self.seeder.write(f"Pre-orders skipped: {exc}")
            return
        to_ship = self._pay_deposit(first)
        ready = self._pay_deposit(self._place_preorder(arrived, 2))
        get_or_create_default_warehouse(KIND_PREORDER)
        record_movement(
            variant=arrived,
            movement_type=MovementType.PURCHASE_IN,
            quantity=3,
            unit_cost=arrived.cost_price,
        )
        allocate_preorder_stock(actor=self.admin)
        for order in (to_ship, ready):
            set_preorder_stage(
                order=order, stage=PreorderStage.PURCHASE_COMPLETED, actor=self.admin
            )
        line = to_ship.lines.get()
        carrier = self.rng.choice(self.carriers)
        create_shipment(
            order=to_ship,
            lines=[{"order_line": line, "quantity": line.quantity}],
            carrier=carrier,
            tracking_number=f"{carrier.code.upper()}{self.rng.randint(10**8, 10**9 - 1)}",
            shipping_charge=to_ship.shipping_total,
        )

        for quantity, stage in ((2, PreorderStage.PURCHASING), (1, PreorderStage.PARTIALLY_PAID)):
            order = self._pay_deposit(self._place_preorder(waiting, quantity))
            set_preorder_stage(order=order, stage=stage, actor=self.admin)

        self._place_preorder(unpaid, 1)

    # ---- customer feedback -------------------------------------------------

    def seed_feedback(self) -> None:
        products = list(Product.objects.filter(slug__startswith=SLUG_PREFIX).order_by("slug")[:12])
        self._seed_reviews()
        if not ProductQuestion.objects.filter(customer__in=self.customers).exists():
            for index, (question, answer) in enumerate(QUESTIONS):
                asked = ask_question(
                    customer=self.customers[index % len(self.customers)],
                    product=products[index % len(products)],
                    question=question,
                )
                if answer:
                    moderate_question(
                        question=asked, actor=self.admin, answer=answer, is_published=True
                    )
                self.bump("questions")
        if not PriceIssueReport.objects.filter(reporter__in=self.customers).exists():
            for index, comment in enumerate(PRICE_REPORT_COMMENTS):
                product = products[(index * 2) % len(products)]
                variant = product.variants.first()
                report = report_price_issue(
                    reporter=self.customers[(index + 3) % len(self.customers)],
                    product=product,
                    variant=variant,
                    expected_price=(variant.price * Decimal("0.9")).quantize(Decimal("1")),
                    comment=comment,
                )
                if index % 2:
                    update_price_report(
                        report=report,
                        actor=self.admin,
                        status=PriceIssueReport.Status.RESOLVED,
                        staff_note="Checked, price is correct.",
                    )
                self.bump("price_reports")
        if not WishlistItem.objects.filter(customer__in=self.customers).exists():
            for index, customer in enumerate(self.customers[:8]):
                for offset in range(2):
                    add_to_wishlist(
                        customer=customer, product=products[(index + offset) % len(products)]
                    )
                    self.bump("wishlist_items")

    def _seed_reviews(self) -> None:
        if ProductReview.objects.filter(customer__in=self.customers).exists():
            return
        bought = (
            SalesOrderLine.objects.filter(
                order__customer__in=self.customers,
                order__status__in=[SalesOrder.Status.DELIVERED, SalesOrder.Status.CLOSED],
            )
            .order_by("order__order_number", "id")
            .values_list("order__customer_id", "variant__product_id")
        )
        seen: set[tuple] = set()
        for pair in bought:
            if pair in seen or len(seen) >= 40:
                continue
            seen.add(pair)
            rating, comment = REVIEW_COMMENTS[len(seen) % len(REVIEW_COMMENTS)]
            try:
                create_review(
                    customer=User.objects.get(pk=pair[0]),
                    product=Product.objects.get(pk=pair[1]),
                    rating=rating,
                    comment=comment,
                )
            except BusinessRuleViolationError:
                continue
            self.bump("reviews")

    def seed_sale(self) -> None:
        """Runs last: the orders seeded above keep the prices they were placed at."""
        name = DEMO_DISCOUNT_NAMES[0]
        category = Category.objects.filter(
            slug=f"{SLUG_PREFIX}{slugify(DEMO_SALE_CATEGORY)}"
        ).first()
        if category is None or Sale.objects.filter(name=name).exists():
            return
        create_sale(
            name=name,
            percent_off=Decimal(DEMO_SALE_PERCENT),
            starts_at=timezone.now() - timedelta(days=1),
            applies_to=Sale.AppliesTo.CATEGORIES,
            category_ids=[category.id],
        )
        self.bump("sales")

    # ---- back office -------------------------------------------------------

    def seed_expense_categories(self) -> None:
        expenses = Expense.objects.filter(
            reference_number__startswith=EXPENSE_REF_PREFIX, category__isnull=True
        ).select_related("expense_account")
        for expense in expenses:
            account = expense.expense_account
            category = ExpenseCategory.objects.filter(name=account.name).first()
            if category is None:
                category = create_expense_category(
                    name=account.name, expense_account=account, description=EXPENSE_CATEGORY_NOTE
                )
                self.bump("expense_categories")
            Expense.objects.filter(pk=expense.pk).update(category=category)

    def seed_fraud_cases(self) -> None:
        if FraudCase.objects.filter(case_number__startswith=DEMO_FRAUD_CASE_PREFIX).exists():
            return
        suspects = SalesOrder.objects.filter(
            customer__in=self.customers, status=SalesOrder.Status.CANCELLED
        ).order_by("order_number")[:3]
        for index, order in enumerate(suspects, start=1):
            FraudCase.objects.create(
                case_number=f"{DEMO_FRAUD_CASE_PREFIX}{index:03d}",
                status=FraudCase.Status.NEW,
                customer=order.customer,
                order=order,
                description="Several cancelled orders to the same phone number.",
            )
            self.bump("fraud_cases")
