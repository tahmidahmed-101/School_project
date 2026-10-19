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
    free_delivery_min_amount = serializers.DecimalField(
        max_digits=14, decimal_places=2, allow_null=True
    )
    social = serializers.SerializerMethodField()
    about = serializers.SerializerMethodField()

    def get_about(self, obj) -> dict[str, str]:
        return {"en": obj.about_en, "bn": obj.about_bn}

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
    kind = serializers.CharField(read_only=True)
    label = serializers.CharField(read_only=True)
    description = serializers.CharField(read_only=True)
    pay_to = serializers.CharField(read_only=True)


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


class PublicHeroSlideSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    image = serializers.SerializerMethodField()
    alt = serializers.CharField(source="alt_text", read_only=True)
    tag = serializers.SerializerMethodField()
    title = serializers.SerializerMethodField()
    link_url = serializers.CharField(read_only=True)
    placement = serializers.CharField(read_only=True)

    def get_image(self, obj) -> str:
        request = self.context.get("request")
        url = obj.image.url
        return request.build_absolute_uri(url) if request else url

    def get_tag(self, obj) -> dict[str, str]:
        return {"en": obj.tag_en, "bn": obj.tag_bn}

    def get_title(self, obj) -> dict[str, str]:
        return {"en": obj.title_en, "bn": obj.title_bn}


class PublicPromoLineSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    text = serializers.SerializerMethodField()
    placement = serializers.CharField(read_only=True)

    def get_text(self, obj) -> dict[str, str]:
        return {"en": obj.text_en, "bn": obj.text_bn}


class _PopupContentSerializer(serializers.Serializer):
    """What every popup shares, read from a `StorefrontPromotion`: its image
    and, when staff gave one, where clicking it goes."""

    id = serializers.UUIDField(source="popup.id", read_only=True)
    image = serializers.SerializerMethodField()
    link_url = serializers.CharField(source="popup.link_url", read_only=True)

    def get_image(self, obj) -> str:
        request = self.context.get("request")
        url = obj.popup.image.url
        return request.build_absolute_uri(url) if request else url


class PublicPromotionPopupSerializer(_PopupContentSerializer):
    """The shop popup and the running sale it promotes."""

    sale = serializers.SerializerMethodField()

    def get_sale(self, obj) -> dict:
        # The same shape as a product's `sale` in the public catalog.
        sale = obj.sale
        return {
            "name": sale.name,
            "percent_off": str(sale.percent_off),
            "ends_at": (
                serializers.DateTimeField().to_representation(sale.ends_at)
                if sale.ends_at
                else None
            ),
        }


class PublicPreorderPopupSerializer(_PopupContentSerializer):
    """The pre-order page popup: no sale."""


class PublicStorefrontContentSerializer(serializers.Serializer):
    hero_slides = PublicHeroSlideSerializer(many=True, read_only=True)
    promo_lines = PublicPromoLineSerializer(many=True, read_only=True)
    promotion_popup = PublicPromotionPopupSerializer(read_only=True, allow_null=True)
    preorder_popup = PublicPreorderPopupSerializer(read_only=True, allow_null=True)
