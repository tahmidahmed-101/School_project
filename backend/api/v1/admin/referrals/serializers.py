from __future__ import annotations

from rest_framework import serializers


class ReferralSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    status = serializers.CharField(read_only=True)
    referrer_name = serializers.SerializerMethodField()
    referrer_contact = serializers.SerializerMethodField()
    order_id = serializers.UUIDField(read_only=True)
    order_number = serializers.CharField(source="order.order_number", read_only=True)
    reward_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    reward_coupon_code = serializers.CharField(
        source="reward_coupon.code", default=None, read_only=True
    )
    rewarded_at = serializers.DateTimeField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)

    def get_referrer_name(self, obj) -> str:
        return obj.referrer.get_full_name() or str(obj.referrer)

    def get_referrer_contact(self, obj) -> str:
        return obj.referrer.phone or obj.referrer.email or ""
