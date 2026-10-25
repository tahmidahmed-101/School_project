from __future__ import annotations

from rest_framework import serializers

from apps.marketing.models import EmailCampaign, NewsletterSubscriber


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


class AdminCampaignSerializer(serializers.Serializer):
    """`delivery_counts` comes from the view's per-page batch (one query),
    never from a query per row."""

    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)
    channel = serializers.CharField(read_only=True)
    subject = serializers.CharField(read_only=True, allow_blank=True)
    body = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    scheduled_at = serializers.DateTimeField(read_only=True, allow_null=True)
    started_at = serializers.DateTimeField(read_only=True, allow_null=True)
    finished_at = serializers.DateTimeField(read_only=True, allow_null=True)
    cancelled_at = serializers.DateTimeField(read_only=True, allow_null=True)
    recipient_count = serializers.IntegerField(read_only=True)
    delivery_counts = serializers.SerializerMethodField(
        help_text="Copies per status. `sent` means accepted by the mail server, not delivered."
    )
    created_by_id = serializers.UUIDField(read_only=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    def get_delivery_counts(self, obj) -> dict:
        from apps.marketing.models import CampaignDelivery

        counts = self.context.get("delivery_counts", {})
        return counts.get(obj.id) or dict.fromkeys(CampaignDelivery.Status.values, 0)


class AdminCampaignWriteSerializer(serializers.Serializer):
    name = serializers.CharField(required=False, max_length=120)
    channel = serializers.ChoiceField(
        choices=EmailCampaign.Channel.choices,
        required=False,
        help_text="Set when creating; a campaign keeps its channel.",
    )
    subject = serializers.CharField(required=False, allow_blank=True, max_length=200)
    body = serializers.CharField(required=False, max_length=50_000, trim_whitespace=False)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Send at least one field.")
        return attrs


class AdminCampaignScheduleSerializer(serializers.Serializer):
    send_at = serializers.DateTimeField(
        required=False, allow_null=True, help_text="Omit to send with the next sender run."
    )


class AdminCampaignTestSerializer(serializers.Serializer):
    recipient = serializers.CharField(
        required=False,
        max_length=254,
        help_text="Defaults to your own email address (SMS: your own phone).",
    )


class AdminCampaignTestResultSerializer(serializers.Serializer):
    accepted = serializers.BooleanField(read_only=True)
    reason = serializers.CharField(read_only=True, allow_blank=True)
    recipient = serializers.CharField(read_only=True)


class AdminCampaignDeliverySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    email = serializers.CharField(read_only=True, allow_blank=True)
    phone = serializers.CharField(read_only=True, allow_blank=True)
    status = serializers.CharField(read_only=True)
    attempts = serializers.IntegerField(read_only=True)
    failure_reason = serializers.CharField(read_only=True, allow_blank=True)
    sent_at = serializers.DateTimeField(read_only=True, allow_null=True)
    updated_at = serializers.DateTimeField(read_only=True)


class AdminAudienceSerializer(serializers.Serializer):
    active_subscribers = serializers.IntegerField(read_only=True)
    eligible_recipients = serializers.IntegerField(read_only=True)
    suppressed_addresses = serializers.IntegerField(read_only=True)
    sms_eligible_recipients = serializers.IntegerField(read_only=True)
    sms_footer_length = serializers.IntegerField(
        read_only=True, help_text="Characters the opt-out line adds to every text."
    )


class AdminSuppressionSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    email = serializers.EmailField(read_only=True)
    reason = serializers.CharField(read_only=True)
    note = serializers.CharField(read_only=True, allow_blank=True)
    created_at = serializers.DateTimeField(read_only=True)


class AdminSuppressionWriteSerializer(serializers.Serializer):
    email = serializers.CharField(max_length=254)
    note = serializers.CharField(required=False, allow_blank=True, max_length=255, default="")
