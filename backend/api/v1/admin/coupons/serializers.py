from __future__ import annotations

from rest_framework import serializers

from apps.orders.models import Coupon


class CouponSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    code = serializers.CharField()
    discount_type = serializers.ChoiceField(choices=Coupon.DiscountType.choices)
    value = serializers.DecimalField(max_digits=12, decimal_places=2)
    min_order_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    usage_limit = serializers.IntegerField(allow_null=True)
    times_used = serializers.IntegerField(read_only=True)
    expires_at = serializers.DateTimeField(allow_null=True)
    is_active = serializers.BooleanField()
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
    expires_at = serializers.DateTimeField(required=False, allow_null=True, default=None)


class CouponUpdateSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32, required=False)
    discount_type = serializers.ChoiceField(choices=Coupon.DiscountType.choices, required=False)
    value = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    min_order_amount = serializers.DecimalField(max_digits=14, decimal_places=2, required=False)
    usage_limit = serializers.IntegerField(required=False, allow_null=True)
    expires_at = serializers.DateTimeField(required=False, allow_null=True)
    is_active = serializers.BooleanField(required=False)
