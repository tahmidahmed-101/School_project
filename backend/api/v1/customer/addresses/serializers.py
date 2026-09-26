from __future__ import annotations

from rest_framework import serializers


class AddressSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    address_type = serializers.ChoiceField(
        choices=("shipping", "billing", "other"),
        required=False,
        default="shipping",
    )
    full_name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=32)
    line1 = serializers.CharField(max_length=255)
    line2 = serializers.CharField(max_length=255, required=False, allow_blank=True)
    city = serializers.CharField(max_length=100, required=False, allow_blank=True)
    state = serializers.CharField(max_length=100, required=False, allow_blank=True)
    postal_code = serializers.CharField(max_length=32, required=False, allow_blank=True)
    country = serializers.CharField(max_length=100)
    is_default = serializers.BooleanField(required=False)


class AddressUpdateSerializer(AddressSerializer):
    full_name = serializers.CharField(max_length=150, required=False)
    phone = serializers.CharField(max_length=32, required=False)
    line1 = serializers.CharField(max_length=255, required=False)
    postal_code = serializers.CharField(max_length=32, required=False, allow_blank=True)
    country = serializers.CharField(max_length=100, required=False)
