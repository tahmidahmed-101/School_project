from __future__ import annotations

from rest_framework import serializers

from apps.marketing.models import NewsletterSubscriber


class AdminNewsletterSubscriberSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    email = serializers.EmailField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    unsubscribed_at = serializers.DateTimeField(read_only=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)


class AdminNewsletterSubscriberWriteSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False)
    is_active = serializers.BooleanField(required=False)

    def validate_email(self, value: str) -> str:
        email = value.strip().lower()
        if not email:
            raise serializers.ValidationError("Email is required.")

        subscriber_id = self.context.get("subscriber_id")
        queryset = NewsletterSubscriber.objects.filter(email__iexact=email)
        if subscriber_id is not None:
            queryset = queryset.exclude(id=subscriber_id)
        if queryset.exists():
            raise serializers.ValidationError("A subscriber with this email already exists.")
        return email

    def validate(self, attrs):
        if not attrs and self.partial:
            raise serializers.ValidationError("Provide at least one field to update.")
        if not self.partial and "email" not in attrs:
            raise serializers.ValidationError({"email": ["Email is required."]})
        return attrs
