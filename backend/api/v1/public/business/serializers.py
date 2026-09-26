from __future__ import annotations

from rest_framework import serializers


class PublicBusinessProfileSerializer(serializers.Serializer):
    """Storefront-facing subset. Registration data (tax_id, trade licence) is
    deliberately absent — this endpoint is unauthenticated."""

    name = serializers.CharField()
    legal_name = serializers.CharField(allow_blank=True)
    tagline = serializers.CharField(allow_blank=True)
    logo_url = serializers.CharField(allow_blank=True)
    phone = serializers.CharField(allow_blank=True)
    whatsapp = serializers.CharField(allow_blank=True)
    email = serializers.CharField(allow_blank=True)
    website = serializers.CharField(allow_blank=True)
    google_maps_url = serializers.CharField(allow_blank=True)
    opening_hours = serializers.CharField(allow_blank=True)
    address = serializers.CharField(source="formatted_address", allow_blank=True)
    social = serializers.SerializerMethodField()

    def get_social(self, obj) -> dict[str, str]:
        return {
            "facebook": obj.facebook_url,
            "instagram": obj.instagram_url,
            "tiktok": obj.tiktok_url,
            "youtube": obj.youtube_url,
            "linkedin": obj.linkedin_url,
        }


class PublicPaymentMethodSerializer(serializers.Serializer):
    """No `can_disable` or `locked_reason`: a storefront needs the offer, not
    the operator's reasons for it."""

    key = serializers.CharField(read_only=True)
    label = serializers.CharField(read_only=True)
    description = serializers.CharField(read_only=True)
