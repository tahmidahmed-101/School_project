from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers


class CustomerPriceReportSerializer(serializers.Serializer):
    """Echoes only what the reporter sent; staff notes and resolution stay internal."""

    id = serializers.UUIDField(read_only=True)
    product_id = serializers.UUIDField(read_only=True)
    variant_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    expected_price = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
        required=False,
        allow_null=True,
        default=None,
    )
    comment = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")
    created_at = serializers.DateTimeField(read_only=True)

    def validate(self, attrs: dict) -> dict:
        if attrs.get("expected_price") is None and not attrs.get("comment", "").strip():
            raise serializers.ValidationError(
                "Give the price you expected or describe the problem."
            )
        return attrs
