from __future__ import annotations

import pytest
from django.core.management import CommandError, call_command

from apps.accounts.constants import UserRole
from apps.accounts.models import User
from apps.business.models import HeroSlide, PromoLine
from apps.catalog.models import Brand, BundleItem, ProductQuestion, Sale, WishlistItem
from apps.common.services.demo_seed.constants import DEMO_DOMAIN, DEMO_PASSWORD
from apps.common.services.demo_seed.wipe import wipe_demo_data
from apps.inventory.models import StockItem
from apps.logistics.models import ShippingRate, ShippingZone
from apps.orders.selectors.payment_methods import is_payment_method_enabled

pytestmark = pytest.mark.django_db

WAREHOUSE_KIND = "warehouse__kind"
VARIANT_KIND = "variant__product__category__category_type"


@pytest.fixture(autouse=True)
def _media_in_tmp(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


def _seed(fresh: bool = False) -> None:
    ShippingZone.objects.get_or_create(
        name="Everywhere", kind="stock", defaults={"country_codes": []}
    )
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
        "sales": Sale.objects.count(),
    }


def test_seed_demo_fills_what_the_storefront_and_dashboard_need():
    _seed()

    assert all(_extras_counts().values()), _extras_counts()
    assert is_payment_method_enabled("cod")
    sale = Sale.objects.get()
    assert sale.status == Sale.Status.RUNNING
    assert set(sale.categories.values_list("category_type", flat=True)) == {"stock"}
    assert User.objects.get(email=f"admin@{DEMO_DOMAIN}").check_password(DEMO_PASSWORD)
    # The demo shop is stock only.
    assert set(StockItem.objects.values_list(WAREHOUSE_KIND, VARIANT_KIND).distinct()) == {
        ("stock", "stock"),
    }
    assert set(ShippingRate.objects.values_list("kind", flat=True)) == {"stock"}
    assert set(Brand.objects.filter(products__isnull=False).values_list("kind", flat=True)) == {
        "stock"
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
