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


class PublicPolicySectionSerializer(serializers.Serializer):
    heading = serializers.DictField(child=serializers.CharField(allow_blank=True))
    body = serializers.DictField(child=serializers.CharField(allow_blank=True))


class PublicStorePolicySerializer(serializers.Serializer):
    """Published content only. No draft state, revisions, or editor identity:
    `effective_date` is the policy's own date, not the row's mtime."""

    kind = serializers.CharField(read_only=True)
    title = serializers.DictField(source="content.title", child=serializers.CharField())
    intro = serializers.DictField(
        source="content.intro", child=serializers.CharField(allow_blank=True)
    )
    sections = PublicPolicySectionSerializer(source="content.sections", many=True)
    effective_date = serializers.DateField(read_only=True)


class PublicPolicyCategorySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)
    slug = serializers.CharField(read_only=True)


class PublicReturnEligibilitySerializer(serializers.Serializer):
    """The rules `create_rma` enforces while this policy is published, so the
    page and the API cannot disagree about who may return what."""

    return_window_days = serializers.IntegerField(read_only=True, allow_null=True)
    preorder_returns_allowed = serializers.BooleanField(read_only=True)
    non_returnable_categories = PublicPolicyCategorySerializer(many=True, read_only=True)


class PublicReturnPolicySerializer(PublicStorePolicySerializer):
    returns_enabled = serializers.SerializerMethodField()
    eligibility = serializers.SerializerMethodField()

    def get_returns_enabled(self, _obj) -> bool:
        return bool(self.context.get("returns_enabled"))

    def get_eligibility(self, obj) -> dict:
        return PublicReturnEligibilitySerializer(
            {
                "return_window_days": obj.return_window_days,
                "preorder_returns_allowed": obj.preorder_returns_allowed,
                "non_returnable_categories": obj.non_returnable_categories.all(),
            }
        ).data
