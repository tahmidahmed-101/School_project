"""The parts of the demo dataset the storefront and dashboard need beyond the
trading history: logins, shop settings, home page content and customer
feedback. Runs after `DemoSeeder` and reuses its customers, variants
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
from apps.business.models import HeroSlide, PromoLine
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
from apps.catalog.services.price_reports import report_price_issue, update_price_report
from apps.catalog.services.products import create_product_image
from apps.catalog.services.questions import ask_question, moderate_question
from apps.catalog.services.reviews import create_review
from apps.catalog.services.sales import create_sale
from apps.catalog.services.wishlist import add_to_wishlist
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.services.demo_seed.constants import (
    BUNDLE_NAME,
    BUNDLE_SKU,
    DEMO_BRANDS,
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
    PRICE_REPORT_COMMENTS,
    PROMO_LINES,
    QUESTIONS,
    REVIEW_COMMENTS,
    SLUG_PREFIX,
)
from apps.orders.models import PaymentMethodSetting, SalesOrder, SalesOrderLine
from apps.orders.services.payment_methods import (
    set_payment_method_enabled,
    set_payment_method_pay_to,
)
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
        if PaymentMethodSetting.objects.exists():
            return
        for key in DEMO_STOREFRONT_METHODS:
            set_payment_method_enabled(key=key, is_enabled=True)
            if key in DEMO_PAY_TO:
                set_payment_method_pay_to(key=key, pay_to=DEMO_PAY_TO[key])
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
        brands: list[Brand] = []
        for name, description in DEMO_BRANDS:
            slug = f"{SLUG_PREFIX}{slugify(name)}"
            brand = Brand.objects.filter(slug=slug).first()
            if brand is None:
                brand = create_brand(name=name, description=description, actor=self.admin)
                Brand.objects.filter(pk=brand.pk).update(slug=slug)
                self.bump("brands")
            brands.append(brand)
        unbranded = Product.objects.filter(slug__startswith=SLUG_PREFIX, brand__isnull=True)
        for index, product_id in enumerate(unbranded.values_list("id", flat=True)):
            Product.objects.filter(pk=product_id).update(brand=brands[index % len(brands)])

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
