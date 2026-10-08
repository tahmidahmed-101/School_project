from __future__ import annotations

from rest_framework import serializers

from apps.common.params import KINDS
from apps.logistics.models import Carrier


class CarrierSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField()
    code = serializers.ChoiceField(choices=Carrier.Provider.choices)
    phone = serializers.CharField(allow_blank=True)
    contact_email = serializers.EmailField(allow_blank=True)
    api_base_url = serializers.CharField(allow_blank=True)
    is_integration_enabled = serializers.BooleanField()
    has_api_key = serializers.SerializerMethodField()
    config_keys = serializers.SerializerMethodField()
    is_active = serializers.BooleanField()
    deleted_at = serializers.DateTimeField(read_only=True, allow_null=True)

    def get_has_api_key(self, obj) -> bool:
        return bool(obj.api_key)

    def get_config_keys(self, obj) -> list[str]:
        """Names only — carrier config holds secrets (Pathao's merchant
        password), so values are never read back out."""
        return sorted((obj.config or {}).keys())


class CarrierCreateSerializer(serializers.Serializer):
    name = serializers.CharField()
    code = serializers.ChoiceField(
        choices=Carrier.Provider.choices, required=False, default=Carrier.Provider.MANUAL
    )
    phone = serializers.CharField(required=False, allow_blank=True, default="")
    contact_email = serializers.EmailField(required=False, allow_blank=True, default="")
    api_base_url = serializers.CharField(required=False, allow_blank=True, default="")
    api_key = serializers.CharField(required=False, allow_blank=True, default="", write_only=True)
    api_secret = serializers.CharField(
        required=False, allow_blank=True, default="", write_only=True
    )
    webhook_secret = serializers.CharField(
        required=False, allow_blank=True, default="", write_only=True
    )
    is_integration_enabled = serializers.BooleanField(required=False, default=False)
    config = serializers.DictField(required=False, default=dict, write_only=True)


class CarrierUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(required=False)
    code = serializers.ChoiceField(choices=Carrier.Provider.choices, required=False)
    phone = serializers.CharField(required=False, allow_blank=True)
    contact_email = serializers.EmailField(required=False, allow_blank=True)
    api_base_url = serializers.CharField(required=False, allow_blank=True)
    api_key = serializers.CharField(required=False, allow_blank=True, write_only=True)
    api_secret = serializers.CharField(required=False, allow_blank=True, write_only=True)
    webhook_secret = serializers.CharField(required=False, allow_blank=True, write_only=True)
    is_integration_enabled = serializers.BooleanField(required=False)
    is_active = serializers.BooleanField(required=False)
    config = serializers.DictField(required=False, write_only=True)


class ShippingRateSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    zone_id = serializers.UUIDField(read_only=True)
    carrier_id = serializers.UUIDField(read_only=True)
    kind = serializers.CharField(read_only=True)
    base_weight = serializers.DecimalField(max_digits=10, decimal_places=3)
    base_charge = serializers.DecimalField(max_digits=10, decimal_places=2)
    increment_weight = serializers.DecimalField(max_digits=10, decimal_places=3)
    increment_charge = serializers.DecimalField(max_digits=10, decimal_places=2)


class ShippingRateInputSerializer(serializers.Serializer):
    carrier_id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=KINDS, required=False)
    base_weight = serializers.DecimalField(max_digits=10, decimal_places=3)
    base_charge = serializers.DecimalField(max_digits=10, decimal_places=2)
    increment_weight = serializers.DecimalField(max_digits=10, decimal_places=3)
    increment_charge = serializers.DecimalField(max_digits=10, decimal_places=2)


class ShippingRateUpdateSerializer(serializers.Serializer):
    base_weight = serializers.DecimalField(max_digits=10, decimal_places=3, required=False)
    base_charge = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)
    increment_weight = serializers.DecimalField(max_digits=10, decimal_places=3, required=False)
    increment_charge = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)


class ShippingZoneSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField()
    kind = serializers.CharField(read_only=True)
    country_codes = serializers.ListField(child=serializers.CharField())
    is_active = serializers.BooleanField()
    deleted_at = serializers.DateTimeField(read_only=True, allow_null=True)
    rates = serializers.SerializerMethodField()

    def get_rates(self, obj) -> list[dict]:
        return ShippingRateSerializer(obj.rates.all(), many=True).data


class ShippingZoneCreateSerializer(serializers.Serializer):
    name = serializers.CharField()
    kind = serializers.ChoiceField(choices=KINDS, required=False)
    country_codes = serializers.ListField(child=serializers.CharField(), required=False)


class ShippingZoneUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(required=False)
    country_codes = serializers.ListField(child=serializers.CharField(), required=False)
    is_active = serializers.BooleanField(required=False)
