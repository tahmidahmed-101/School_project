from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers

from api.v1.admin.coupons.serializers import NamedRowSerializer, id_list_field
from apps.catalog.models import Sale


class SaleSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField()
    percent_off = serializers.DecimalField(max_digits=5, decimal_places=2)
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField(allow_null=True)
    is_active = serializers.BooleanField()
    applies_to = serializers.ChoiceField(choices=Sale.AppliesTo.choices)
    status = serializers.CharField(read_only=True)
    categories = NamedRowSerializer(many=True, read_only=True)
    brands = NamedRowSerializer(many=True, read_only=True)
    products = NamedRowSerializer(many=True, read_only=True)


class SaleUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150, required=False)
    percent_off = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=Decimal("0.01"),
        max_value=Decimal("99.99"),
        required=False,
    )
    starts_at = serializers.DateTimeField(required=False)
    ends_at = serializers.DateTimeField(required=False, allow_null=True)
    is_active = serializers.BooleanField(required=False)
    applies_to = serializers.ChoiceField(choices=Sale.AppliesTo.choices, required=False)
    category_ids = id_list_field()
    brand_ids = id_list_field()
    product_ids = id_list_field()


class SaleCreateSerializer(SaleUpdateSerializer):
    name = serializers.CharField(max_length=150)
    percent_off = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal("0.01"), max_value=Decimal("99.99")
    )
    starts_at = serializers.DateTimeField()
