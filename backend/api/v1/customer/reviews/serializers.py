from __future__ import annotations

from rest_framework import serializers


class CustomerReviewSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    product_id = serializers.UUIDField(read_only=True)
    rating = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(required=False, allow_blank=True, default="")
    is_verified_purchase = serializers.BooleanField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)


class CustomerReviewUpdateSerializer(serializers.Serializer):
    rating = serializers.IntegerField(min_value=1, max_value=5, required=False)
    comment = serializers.CharField(required=False, allow_blank=True)
