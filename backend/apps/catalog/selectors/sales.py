from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from django.core.cache import cache
from django.db.models import Q, QuerySet
from django.utils import timezone

from apps.catalog.models import Sale
from apps.catalog.selectors.categories import category_ids_with_descendants
from apps.common.utils.money import quantize

LIVE_SALES_CACHE_KEY = "catalog:live_sales"
LIVE_SALES_CACHE_SECONDS = 60
PRIMED_SALES_ATTR = "_running_sales"


@dataclass(frozen=True)
class LiveSale:
    """A sale as pricing needs it: plain values and target id sets, so a page
    of products is priced without touching the database."""

    id: UUID
    name: str
    percent_off: Decimal
    starts_at: datetime
    ends_at: datetime | None
    applies_to: str
    target_ids: frozenset

    def is_running(self, now: datetime) -> bool:
        return self.starts_at <= now and (self.ends_at is None or now < self.ends_at)

    def covers(self, product) -> bool:
        if self.applies_to == Sale.AppliesTo.ALL:
            return True
        if self.applies_to == Sale.AppliesTo.CATEGORIES:
            return product.category_id in self.target_ids
        if self.applies_to == Sale.AppliesTo.BRANDS:
            return product.brand_id in self.target_ids
        return product.id in self.target_ids

    def price_for(self, list_price: Decimal) -> Decimal:
        return quantize(list_price * (Decimal("100") - self.percent_off) / Decimal("100"))


def _not_ended(now: datetime) -> Q:
    return Q(ends_at__isnull=True) | Q(ends_at__gt=now)


def sales_list(*, include_deleted: bool = False, status: str | None = None) -> QuerySet[Sale]:
    queryset = Sale.objects.prefetch_related("categories", "brands", "products")
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    now = timezone.now()
    if status == Sale.Status.OFF:
        queryset = queryset.filter(is_active=False)
    elif status == Sale.Status.ENDED:
        queryset = queryset.filter(is_active=True, ends_at__lte=now)
    elif status == Sale.Status.SCHEDULED:
        queryset = queryset.filter(_not_ended(now), is_active=True, starts_at__gt=now)
    elif status == Sale.Status.RUNNING:
        queryset = queryset.filter(_not_ended(now), is_active=True, starts_at__lte=now)
    return queryset.order_by("-starts_at")


def get_sale_by_id(sale_id: str | UUID, *, include_deleted: bool = False) -> Sale | None:
    return sales_list(include_deleted=include_deleted).filter(id=sale_id).first()


def _target_ids(sale: Sale) -> frozenset:
    if sale.applies_to == Sale.AppliesTo.CATEGORIES:
        return frozenset(
            category_ids_with_descendants(category.id for category in sale.categories.all())
        )
    if sale.applies_to == Sale.AppliesTo.BRANDS:
        return frozenset(brand.id for brand in sale.brands.all())
    if sale.applies_to == Sale.AppliesTo.PRODUCTS:
        return frozenset(product.id for product in sale.products.all())
    return frozenset()


def live_sale_of(sale: Sale) -> LiveSale:
    """`sale` as pricing reads it, so another feature asks "does it cover this
    product" with the same rule that sets the price. Prefetch its targets."""
    return LiveSale(
        id=sale.id,
        name=sale.name,
        percent_off=sale.percent_off,
        starts_at=sale.starts_at,
        ends_at=sale.ends_at,
        applies_to=sale.applies_to,
        target_ids=_target_ids(sale),
    )


def _load_live_sales() -> list[LiveSale]:
    sales = sales_list().filter(_not_ended(timezone.now()), is_active=True)
    return [live_sale_of(sale) for sale in sales]


def live_sales() -> list[LiveSale]:
    """Switched-on sales that have not ended, scheduled ones included. Cached
    so pricing a variant costs no query; the window is checked at read time,
    so a sale starts and ends on the second even from a cached list."""
    cached = cache.get(LIVE_SALES_CACHE_KEY)
    if cached is None:
        cached = _load_live_sales()
        cache.set(LIVE_SALES_CACHE_KEY, cached, LIVE_SALES_CACHE_SECONDS)
    return cached


def clear_live_sales_cache() -> None:
    cache.delete(LIVE_SALES_CACHE_KEY)


def running_sales() -> list[LiveSale]:
    now = timezone.now()
    return [sale for sale in live_sales() if sale.is_running(now)]


def running_sale_by_id(sale_id) -> LiveSale | None:
    """The running sale with this id, from the same cached list prices use."""
    return next((sale for sale in running_sales() if sale.id == sale_id), None)


def best_sale_for(product, sales: list[LiveSale] | None = None) -> LiveSale | None:
    """The running sale with the biggest percent that covers this product."""
    if sales is None:
        sales = running_sales()
    covering = [sale for sale in sales if sale.covers(product)]
    return max(covering, key=lambda sale: sale.percent_off, default=None)


def prime_running_sales(variants) -> None:
    """Hand a page of variants one shared list of running sales, so their
    prices cost a single cache read instead of one per price lookup."""
    sales = running_sales()
    for variant in variants:
        setattr(variant, PRIMED_SALES_ATTR, sales)
