from __future__ import annotations

from rest_framework import serializers

from apps.risk.models import FraudCase, PhoneBlock, RiskAssessment
from apps.risk.services.guidance import describe


class RiskAssessmentSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    order_id = serializers.UUIDField(read_only=True)
    customer_id = serializers.UUIDField(read_only=True, allow_null=True)
    risk_level = serializers.ChoiceField(choices=RiskAssessment.RiskLevel.choices)
    risk_score = serializers.DecimalField(max_digits=5, decimal_places=2)
    risk_reasons = serializers.ListField(child=serializers.CharField())
    recommended_action = serializers.ChoiceField(choices=RiskAssessment.RecommendedAction.choices)
    auto_blocked = serializers.BooleanField()
    guidance = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(read_only=True)

    def get_guidance(self, obj) -> str:
        return describe(obj.risk_level, obj.recommended_action)


class FraudCaseSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    case_number = serializers.CharField(read_only=True)
    status = serializers.ChoiceField(choices=FraudCase.Status.choices)
    order_id = serializers.UUIDField(read_only=True, allow_null=True)
    customer_id = serializers.UUIDField(read_only=True, allow_null=True)
    description = serializers.CharField()
    resolution = serializers.CharField(allow_blank=True)
    resolution_notes = serializers.CharField(allow_blank=True)
    resolved_at = serializers.DateTimeField(read_only=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)


class ResolveFraudCaseSerializer(serializers.Serializer):
    resolution = serializers.CharField()
    resolution_notes = serializers.CharField(required=False, allow_blank=True, default="")


class IPBlockSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    ip_address = serializers.IPAddressField()
    reason = serializers.CharField()
    expires_at = serializers.DateTimeField(required=False, allow_null=True, default=None)
    is_active = serializers.BooleanField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)


class UnblockIPSerializer(serializers.Serializer):
    ip_address = serializers.IPAddressField()


class PhoneBlockSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    phone_number = serializers.CharField()
    strength = serializers.ChoiceField(choices=PhoneBlock.Strength.choices)
    origin = serializers.ChoiceField(choices=PhoneBlock.Origin.choices, read_only=True)
    reason = serializers.CharField()
    is_active = serializers.BooleanField(read_only=True)
    lifted_at = serializers.DateTimeField(read_only=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)


class BlockPhoneSerializer(serializers.Serializer):
    phone_number = serializers.CharField()
    reason = serializers.CharField()
    strength = serializers.ChoiceField(
        choices=PhoneBlock.Strength.choices,
        required=False,
        default=PhoneBlock.Strength.ADVANCE_ONLY,
    )


class LiftPhoneBlockSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="")
