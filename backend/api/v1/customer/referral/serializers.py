from __future__ import annotations

from rest_framework import serializers


class ReferralRewardSerializer(serializers.Serializer):
    code = serializers.CharField(source="reward_coupon.code", read_only=True)
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, source="reward_amount", read_only=True
    )
    used = serializers.SerializerMethodField()
    expires_at = serializers.DateTimeField(source="reward_coupon.expires_at", read_only=True)

    def get_used(self, obj) -> bool:
        return obj.reward_coupon.times_used > 0


class ReferralSummarySerializer(serializers.Serializer):
    enabled = serializers.BooleanField()
    code = serializers.CharField(allow_null=True)
    friend_discount = serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True)
    reward_amount = serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True)
    rewards = ReferralRewardSerializer(many=True)
