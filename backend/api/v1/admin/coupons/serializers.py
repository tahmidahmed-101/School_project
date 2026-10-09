from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers

from apps.orders.models import Coupon

MAX_TARGETS = 500


class NamedRowSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)


def id_list_field() -> serializers.ListField:
    return serializers.ListField(
        child=serializers.UUIDField(), required=False, max_length=MAX_TARGETS
    )


class CouponSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    code = serializers.CharField()
    discount_type = serializers.ChoiceField(choices=Coupon.DiscountType.choices)
    value = serializers.DecimalField(max_digits=12, decimal_places=2)
    min_order_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    usage_limit = serializers.IntegerField(allow_null=True)
    times_used = serializers.IntegerField(read_only=True)
    per_customer_limit = serializers.IntegerField(allow_null=True)
    max_discount_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True
    )
    starts_at = serializers.DateTimeField(allow_null=True)
    expires_at = serializers.DateTimeField(allow_null=True)
    categories = NamedRowSerializer(many=True, read_only=True)
    brands = NamedRowSerializer(many=True, read_only=True)
    is_active = serializers.BooleanField()
    show_on_storefront = serializers.BooleanField()
    created_at = serializers.DateTimeField(read_only=True)
    deleted_at = serializers.DateTimeField(read_only=True, allow_null=True)


class CouponCreateSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    discount_type = serializers.ChoiceField(
        choices=Coupon.DiscountType.choices, required=False, default=Coupon.DiscountType.PERCENTAGE
    )
    value = serializers.DecimalField(max_digits=12, decimal_places=2)
    min_order_amount = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, default=0
    )
    usage_limit = serializers.IntegerField(required=False, allow_null=True, default=None)
    per_customer_limit = serializers.IntegerField(
        required=False, allow_null=True, default=None, min_value=1
    )
    max_discount_amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        allow_null=True,
        default=None,
        min_value=Decimal("0.01"),
    )
    starts_at = serializers.DateTimeField(required=False, allow_null=True, default=None)
    expires_at = serializers.DateTimeField(required=False, allow_null=True, default=None)
    show_on_storefront = serializers.BooleanField(required=False, default=False)
    category_ids = id_list_field()
    brand_ids = id_list_field()


class CouponUpdateSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32, required=False)
    discount_type = serializers.ChoiceField(choices=Coupon.DiscountType.choices, required=False)
    value = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    min_order_amount = serializers.DecimalField(max_digits=14, decimal_places=2, required=False)
    usage_limit = serializers.IntegerField(required=False, allow_null=True)
    per_customer_limit = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    max_discount_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True, min_value=Decimal("0.01")
    )
    starts_at = serializers.DateTimeField(required=False, allow_null=True)
    expires_at = serializers.DateTimeField(required=False, allow_null=True)
    is_active = serializers.BooleanField(required=False)
    show_on_storefront = serializers.BooleanField(required=False)
    category_ids = id_list_field()
    brand_ids = id_list_field()
