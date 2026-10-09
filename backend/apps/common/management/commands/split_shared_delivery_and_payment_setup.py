from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.common.params import KIND_PREORDER, KIND_STOCK
from apps.logistics.models import ShippingRate, ShippingZone
from apps.orders.models import PaymentMethodSetting


class Command(BaseCommand):
    help = (
        "Give the pre-order half its own delivery zones, delivery rates and payment method "
        "settings by copying the stock ones, so a pre-order checkout charges and offers what it "
        "did before the split. Rows the pre-order half already has are left alone. Prints what "
        "it would change; pass --apply to write."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument("--apply", action="store_true", help="Write the changes.")

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        self.apply = options["apply"]
        changed = 0
        zones = ShippingZone.objects.filter(kind=KIND_STOCK, deleted_at__isnull=True)
        for zone in zones.order_by("name", "id"):
            changed += self._copy_zone(zone)
        settings = PaymentMethodSetting.objects.filter(kind=KIND_STOCK)
        changed += sum(self._copy_payment_method(setting) for setting in settings.order_by("key"))
        if self.apply:
            self.stdout.write(f"{changed} row(s) changed.")
        else:
            self.stdout.write(f"{changed} row(s) would change. Dry run; nothing written.")

    def _say(self, label: str, done: str, planned: str) -> None:
        self.stdout.write(f"{label}: {done if self.apply else planned}")

    def _copy_zone(self, zone: ShippingZone) -> int:
        label = f"Delivery zone {zone.name!r}"
        changed = 0
        twin = ShippingZone.objects.filter(name=zone.name, kind=KIND_PREORDER).first()
        if twin is None:
            self._say(label, "pre-order copy made", "would make a pre-order copy")
            changed += 1
            if self.apply:
                twin = ShippingZone.objects.create(
                    name=zone.name,
                    kind=KIND_PREORDER,
                    country_codes=list(zone.country_codes or []),
                    is_active=zone.is_active,
                )
        elif twin.deleted_at is not None:
            return 0
        taken = (
            set(ShippingRate.objects.filter(zone=twin).values_list("carrier_id", flat=True))
            if twin is not None
            else set()
        )
        rates = ShippingRate.objects.filter(zone=zone, kind=KIND_STOCK).select_related("carrier")
        for rate in rates.order_by("carrier__name", "id"):
            if rate.carrier_id in taken:
                continue
            self._say(
                f"{label}, {rate.carrier.name}",
                "pre-order rate copied",
                "would copy the rate for pre-orders",
            )
            changed += 1
            if self.apply:
                ShippingRate.objects.create(
                    zone=twin,
                    carrier=rate.carrier,
                    kind=KIND_PREORDER,
                    base_weight=rate.base_weight,
                    base_charge=rate.base_charge,
                    increment_weight=rate.increment_weight,
                    increment_charge=rate.increment_charge,
                )
        return changed

    def _copy_payment_method(self, setting: PaymentMethodSetting) -> bool:
        if PaymentMethodSetting.objects.filter(key=setting.key, kind=KIND_PREORDER).exists():
            return False
        self._say(
            f"Payment method {setting.key!r}",
            "pre-order setting copied",
            "would copy the setting for pre-orders",
        )
        if self.apply:
            PaymentMethodSetting.objects.create(
                key=setting.key,
                kind=KIND_PREORDER,
                is_enabled=setting.is_enabled,
                pay_to=setting.pay_to,
            )
        return True
