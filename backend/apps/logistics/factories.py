from __future__ import annotations

from decimal import Decimal

import factory

from apps.logistics.models import Carrier, ShippingRate, ShippingZone


class CarrierFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Carrier
        django_get_or_create = ("name",)

    name = factory.Sequence(lambda n: f"Carrier {n}")


class ShippingZoneFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ShippingZone
        django_get_or_create = ("name",)

    name = factory.Sequence(lambda n: f"Zone {n}")


class ShippingRateFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ShippingRate

    zone = factory.SubFactory(ShippingZoneFactory)
    carrier = factory.SubFactory(CarrierFactory)
    base_weight = Decimal("0")
    base_charge = Decimal("9.99")
    increment_weight = Decimal("1")
    increment_charge = Decimal("2.00")
