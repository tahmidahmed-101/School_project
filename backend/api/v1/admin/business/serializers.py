from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator
from rest_framework import serializers
from rest_framework.fields import empty

from apps.business.models import PolicyKind
from apps.business.models.storefront_content import WRITABLE_PLACEMENTS
from apps.business.policy_content import missing_policy_fields
from apps.common.serializers import user_label

_validate_url = URLValidator()


class AdminBusinessProfileSerializer(serializers.Serializer):
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

    address_line = serializers.CharField(allow_blank=True)
    district = serializers.CharField(allow_blank=True)
    thana = serializers.CharField(allow_blank=True)
    postcode = serializers.CharField(allow_blank=True)
    country = serializers.CharField(allow_blank=True)
    formatted_address = serializers.CharField(read_only=True)

    currency_code = serializers.CharField()
    currency_symbol = serializers.CharField()

    tax_id = serializers.CharField(allow_blank=True)
    trade_licence_no = serializers.CharField(allow_blank=True)

    facebook_url = serializers.CharField(allow_blank=True)
    instagram_url = serializers.CharField(allow_blank=True)
    tiktok_url = serializers.CharField(allow_blank=True)
    youtube_url = serializers.CharField(allow_blank=True)
    linkedin_url = serializers.CharField(allow_blank=True)

    preorder_deposit_percent = serializers.DecimalField(max_digits=5, decimal_places=2)
    free_delivery_min_amount = serializers.DecimalField(
        max_digits=14, decimal_places=2, allow_null=True
    )
    about_en = serializers.CharField(allow_blank=True)
    about_bn = serializers.CharField(allow_blank=True)

    updated_at = serializers.DateTimeField(read_only=True)


class AdminBusinessProfileUpdateSerializer(serializers.Serializer):
    """Only `name` is mandatory — everything else may be cleared, so each optional
    URL/email field must accept "" alongside a valid value."""

    name = serializers.CharField(required=False, allow_blank=False, max_length=200)
    legal_name = serializers.CharField(required=False, allow_blank=True, max_length=200)
    tagline = serializers.CharField(required=False, allow_blank=True, max_length=200)
    logo_url = serializers.CharField(required=False, allow_blank=True)

    phone = serializers.CharField(required=False, allow_blank=True, max_length=50)
    whatsapp = serializers.CharField(required=False, allow_blank=True, max_length=50)
    email = serializers.EmailField(required=False, allow_blank=True, max_length=254)
    website = serializers.CharField(required=False, allow_blank=True, max_length=255)
    google_maps_url = serializers.CharField(required=False, allow_blank=True, max_length=500)
    opening_hours = serializers.CharField(required=False, allow_blank=True, max_length=200)

    address_line = serializers.CharField(required=False, allow_blank=True, max_length=255)
    district = serializers.CharField(required=False, allow_blank=True, max_length=100)
    thana = serializers.CharField(required=False, allow_blank=True, max_length=100)
    postcode = serializers.CharField(required=False, allow_blank=True, max_length=20)
    country = serializers.CharField(required=False, allow_blank=True, max_length=100)

    currency_code = serializers.CharField(required=False, allow_blank=False, max_length=3)
    currency_symbol = serializers.CharField(required=False, allow_blank=False, max_length=8)

    tax_id = serializers.CharField(required=False, allow_blank=True, max_length=50)
    trade_licence_no = serializers.CharField(required=False, allow_blank=True, max_length=50)

    facebook_url = serializers.CharField(required=False, allow_blank=True, max_length=500)
    instagram_url = serializers.CharField(required=False, allow_blank=True, max_length=500)
    tiktok_url = serializers.CharField(required=False, allow_blank=True, max_length=500)
    youtube_url = serializers.CharField(required=False, allow_blank=True, max_length=500)
    linkedin_url = serializers.CharField(required=False, allow_blank=True, max_length=500)

    preorder_deposit_percent = serializers.DecimalField(
        required=False,
        max_digits=5,
        decimal_places=2,
        min_value=Decimal("0"),
        max_value=Decimal("100"),
    )
    free_delivery_min_amount = serializers.DecimalField(
        required=False, allow_null=True, max_digits=14, decimal_places=2, min_value=Decimal("0")
    )
    about_en = serializers.CharField(required=False, allow_blank=True, max_length=5000)
    about_bn = serializers.CharField(required=False, allow_blank=True, max_length=5000)

    URL_FIELDS = (
        "website",
        "google_maps_url",
        "facebook_url",
        "instagram_url",
        "tiktok_url",
        "youtube_url",
        "linkedin_url",
    )

    def validate(self, attrs: dict) -> dict:
        errors = {}
        for field in self.URL_FIELDS:
            value = attrs.get(field, "").strip() if field in attrs else ""
            if field not in attrs or not value:
                if field in attrs:
                    attrs[field] = ""
                continue
            # The seeded website is a bare domain; assume https rather than reject it.
            candidate = value if "://" in value else f"https://{value}"
            try:
                _validate_url(candidate)
            except DjangoValidationError:
                errors[field] = ["Enter a valid URL."]
            else:
                attrs[field] = candidate
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class AdminModuleConfigFieldSerializer(serializers.Serializer):
    key = serializers.CharField(read_only=True)
    label = serializers.CharField(read_only=True)
    description = serializers.CharField(read_only=True)
    value = serializers.BooleanField(read_only=True)


class AdminModuleSerializer(serializers.Serializer):
    key = serializers.CharField(read_only=True)
    label = serializers.CharField(read_only=True)
    description = serializers.CharField(read_only=True)
    is_licensed = serializers.BooleanField(read_only=True)
    is_enabled = serializers.BooleanField(read_only=True)
    can_disable = serializers.BooleanField(read_only=True)
    locked_reason = serializers.CharField(read_only=True)
    depends_on = serializers.ListField(child=serializers.CharField(), read_only=True)
    dependents = serializers.ListField(child=serializers.CharField(), read_only=True)
    blocking_dependents = serializers.ListField(child=serializers.CharField(), read_only=True)
    missing_dependencies = serializers.ListField(child=serializers.CharField(), read_only=True)
    permission_codes = serializers.ListField(child=serializers.CharField(), read_only=True)
    config_fields = AdminModuleConfigFieldSerializer(many=True, read_only=True)


class AdminModuleUpdateSerializer(serializers.Serializer):
    """A PATCH carries either the on/off switch or a config change, never both —
    they take different code paths and mixing them hides which one was refused."""

    is_enabled = serializers.BooleanField(required=False)
    config = serializers.DictField(child=serializers.BooleanField(), required=False)

    def validate(self, attrs: dict) -> dict:
        if ("is_enabled" in attrs) == ("config" in attrs):
            raise serializers.ValidationError("Send exactly one of is_enabled or config.")
        return attrs


class AdminSmsStatusSerializer(serializers.Serializer):
    provider = serializers.CharField(read_only=True)
    is_configured = serializers.BooleanField(read_only=True)
    from_number = serializers.CharField(read_only=True, allow_blank=True)


class AdminIntegrationStatusSerializer(serializers.Serializer):
    sms = AdminSmsStatusSerializer(read_only=True)


class AdminPaymentMethodSerializer(serializers.Serializer):
    key = serializers.CharField(read_only=True)
    kind = serializers.CharField(read_only=True)
    label = serializers.CharField(read_only=True)
    description = serializers.CharField(read_only=True)
    is_enabled = serializers.BooleanField(read_only=True)
    pay_to = serializers.CharField(read_only=True)
    can_disable = serializers.BooleanField(read_only=True)
    locked_reason = serializers.CharField(read_only=True)


class AdminPaymentMethodUpdateSerializer(serializers.Serializer):
    is_enabled = serializers.BooleanField(required=False)
    pay_to = serializers.CharField(required=False, allow_blank=True, max_length=200)


class AdminPolicyCategorySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)


class AdminStorePolicySerializer(serializers.Serializer):
    kind = serializers.CharField(read_only=True)
    label = serializers.CharField(source="get_kind_display", read_only=True)
    content = serializers.JSONField(read_only=True)
    effective_date = serializers.DateField(read_only=True, allow_null=True)
    is_published = serializers.BooleanField(read_only=True)
    missing_fields = serializers.SerializerMethodField()
    return_rules = serializers.SerializerMethodField()
    updated_at = serializers.DateTimeField(read_only=True)

    def get_missing_fields(self, obj) -> list[str]:
        """What still blocks publishing, so the editor can show it up front."""
        return missing_policy_fields(obj.content)

    def get_return_rules(self, obj) -> dict | None:
        if obj.kind != PolicyKind.RETURNS:
            return None
        return {
            "return_window_days": obj.return_window_days,
            "preorder_returns_allowed": obj.preorder_returns_allowed,
            "non_returnable_categories": AdminPolicyCategorySerializer(
                obj.non_returnable_categories.all(), many=True
            ).data,
        }


class AdminStorePolicyUpdateSerializer(serializers.Serializer):
    """Types only. Shape, completeness, date and rule checks live in
    `update_store_policy` so every write path applies the same ones."""

    content = serializers.JSONField(required=False)
    effective_date = serializers.DateField(required=False, allow_null=True)
    is_published = serializers.BooleanField(required=False)
    return_window_days = serializers.IntegerField(required=False, allow_null=True)
    preorder_returns_allowed = serializers.BooleanField(required=False)
    non_returnable_category_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, max_length=200
    )


class AdminStorePolicyRevisionSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    effective_date = serializers.DateField(read_only=True, allow_null=True)
    changed_by_id = serializers.UUIDField(read_only=True, allow_null=True)
    changed_by_name = serializers.SerializerMethodField()
    previous = serializers.JSONField(read_only=True)
    current = serializers.JSONField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)

    def get_changed_by_name(self, obj) -> str:
        return user_label(obj.changed_by)


class _OmittableBooleanField(serializers.BooleanField):
    # DRF reads a boolean missing from a multipart form as an unticked
    # checkbox (False), which would create every uploaded slide inactive.
    default_empty_html = empty


class AdminHeroSlideSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    image = serializers.SerializerMethodField()
    alt_text = serializers.CharField(read_only=True)
    tag_en = serializers.CharField(read_only=True)
    tag_bn = serializers.CharField(read_only=True)
    title_en = serializers.CharField(read_only=True)
    title_bn = serializers.CharField(read_only=True)
    link_url = serializers.CharField(read_only=True)
    placement = serializers.CharField(read_only=True)
    sort_order = serializers.IntegerField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)

    def get_image(self, obj) -> str:
        request = self.context.get("request")
        url = obj.image.url
        return request.build_absolute_uri(url) if request else url


class AdminHeroSlideWriteSerializer(serializers.Serializer):
    """Used with `partial=True` on PATCH, so `image` and `placement` are only
    mandatory on create. A row belongs to one shop: `both` is refused."""

    image = serializers.ImageField()
    alt_text = serializers.CharField(required=False, allow_blank=True, max_length=200)
    tag_en = serializers.CharField(required=False, allow_blank=True, max_length=80)
    tag_bn = serializers.CharField(required=False, allow_blank=True, max_length=80)
    title_en = serializers.CharField(required=False, allow_blank=True, max_length=160)
    title_bn = serializers.CharField(required=False, allow_blank=True, max_length=160)
    link_url = serializers.CharField(required=False, allow_blank=True, max_length=500)
    placement = serializers.ChoiceField(choices=WRITABLE_PLACEMENTS)
    sort_order = serializers.IntegerField(required=False, min_value=0, max_value=32767)
    is_active = _OmittableBooleanField(required=False)

    def validate_link_url(self, value: str) -> str:
        if value and not value.startswith(("/", "http://", "https://")):
            raise serializers.ValidationError("Enter a site path starting with / or a full URL.")
        return value


class AdminPromoLineSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    text_en = serializers.CharField(read_only=True)
    text_bn = serializers.CharField(read_only=True)
    placement = serializers.CharField(read_only=True)
    sort_order = serializers.IntegerField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)


class AdminPromoLineWriteSerializer(serializers.Serializer):
    text_en = serializers.CharField(max_length=160)
    text_bn = serializers.CharField(required=False, allow_blank=True, max_length=160)
    placement = serializers.ChoiceField(choices=WRITABLE_PLACEMENTS)
    sort_order = serializers.IntegerField(required=False, min_value=0, max_value=32767)
    is_active = _OmittableBooleanField(required=False)
