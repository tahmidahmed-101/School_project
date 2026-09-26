from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from apps.accounting.models import TaxRate


def tax_rates_list(*, include_deleted: bool = False) -> QuerySet[TaxRate]:
    queryset = TaxRate.objects.all()
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    return queryset.order_by("name")


def get_tax_rate_by_id(tax_rate_id: str | UUID, *, include_deleted: bool = False) -> TaxRate | None:
    queryset = TaxRate.objects.all()
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    return queryset.filter(id=tax_rate_id).first()


def get_default_tax_rate() -> TaxRate | None:
    """The single default rate applied to orders. Returns None when no
    rates are configured, which keeps order tax at zero until an
    accountant creates one (blueprint §8's Tax Payable side stays
    dormant until then)."""
    queryset = TaxRate.objects.filter(deleted_at__isnull=True, is_active=True)
    return queryset.filter(is_default=True).first() or queryset.order_by("name").first()
