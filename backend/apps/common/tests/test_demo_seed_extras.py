from __future__ import annotations

from io import StringIO

import pytest
from django.core.management import CommandError, call_command

from apps.accounts.constants import UserRole
from apps.accounts.models import User
from apps.business.models import HeroSlide, PromoLine
from apps.catalog.models import Brand, BundleItem, ProductQuestion, WishlistItem
from apps.common.services.demo_seed.constants import DEMO_DOMAIN, DEMO_PASSWORD
from apps.common.services.demo_seed.wipe import wipe_demo_data
from apps.inventory.models import StockItem
from apps.logistics.models import ShippingZone
from apps.orders.models import SalesOrder
from apps.orders.selectors.payment_methods import is_payment_method_enabled

pytestmark = pytest.mark.django_db

WAREHOUSE_KIND = "warehouse__kind"
VARIANT_KIND = "variant__product__category__category_type"


@pytest.fixture(autouse=True)
def _media_in_tmp(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


def _seed(fresh: bool = False) -> None:
    ShippingZone.objects.get_or_create(name="Everywhere", defaults={"country_codes": []})
    call_command("seed_demo", orders=6, days=10, customers=4, fresh=fresh, verbosity=0)


def _extras_counts() -> dict[str, int]:
    return {
        "team": User.objects.filter(email__endswith=f"@{DEMO_DOMAIN}")
        .exclude(role=UserRole.CUSTOMER)
        .count(),
        "slides": HeroSlide.objects.count(),
        "promo": PromoLine.objects.count(),
        "brands": Brand.objects.count(),
        "bundle_items": BundleItem.objects.count(),
        "questions": ProductQuestion.objects.count(),
        "wishlist": WishlistItem.objects.count(),
        "preorders": SalesOrder.objects.filter(order_type=SalesOrder.OrderType.PREORDER).count(),
    }


def test_seed_demo_fills_what_the_storefront_and_dashboard_need():
    _seed()

    assert all(_extras_counts().values()), _extras_counts()
    assert is_payment_method_enabled("cod")
    assert User.objects.get(email=f"admin@{DEMO_DOMAIN}").check_password(DEMO_PASSWORD)
    preorders = SalesOrder.objects.filter(order_type=SalesOrder.OrderType.PREORDER)
    assert set(preorders.values_list("status", flat=True)) == {
        SalesOrder.Status.AWAITING_PAYMENT,
        SalesOrder.Status.CONFIRMED,
        SalesOrder.Status.SHIPPED,
    }
    assert any(line.shippable_quantity for order in preorders for line in order.lines.all())
    out = StringIO()
    call_command("fix_product_kind_mismatches", stdout=out)
    assert "0 variant(s) would change" in out.getvalue(), out.getvalue()
    out = StringIO()
    call_command("split_shared_suppliers_and_brands", stdout=out)
    assert "0 row(s) would change" in out.getvalue(), out.getvalue()
    out = StringIO()
    call_command("split_shared_warehouses", stdout=out)
    assert "0 row(s) would change" in out.getvalue(), out.getvalue()
    assert set(StockItem.objects.values_list(WAREHOUSE_KIND, VARIANT_KIND).distinct()) == {
        ("stock", "stock"),
        ("preorder", "preorder"),
    }
    assert set(Brand.objects.filter(products__isnull=False).values_list("kind", flat=True)) == {
        "stock",
        "preorder",
    }


def test_a_second_run_adds_nothing_and_a_wipe_removes_the_extras():
    _seed()
    first = _extras_counts()

    _seed()
    assert _extras_counts() == first

    wipe_demo_data()
    assert not any(_extras_counts().values()), _extras_counts()


def test_seed_demo_refuses_production_settings(settings):
    settings.SETTINGS_MODULE = "config.settings.production"

    with pytest.raises(CommandError):
        _seed()
