from __future__ import annotations

from rest_framework import serializers


class CustomerQuestionSerializer(serializers.Serializer):
    """The author's own view, so pending questions and publish state show."""

    id = serializers.UUIDField(read_only=True)
    product_id = serializers.UUIDField(read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    question = serializers.CharField(max_length=1000)
    answer = serializers.CharField(read_only=True)
    is_published = serializers.BooleanField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    answered_at = serializers.DateTimeField(read_only=True)
