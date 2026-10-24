from __future__ import annotations

from rest_framework import serializers
from rest_framework.fields import empty

from apps.catalog.models import Category, Product
from apps.catalog.selectors.images import variant_image_url
from apps.catalog.selectors.options import (
    COLOUR_NAMES,
    SIZE_NAMES,
    product_options,
    product_specs,
    variant_legacy_field,
    variant_option_values,
    variant_title,
)
from apps.catalog.selectors.products import added_by_label
from apps.common.params import KINDS
from apps.inventory.selectors.stock import (
    available_quantities_for_variants,
    reorder_points_for_variants,
)


def _image_url(obj, context: dict) -> str | None:
    if not obj.image:
        return None
    request = context.get("request")
    url = obj.image.url
    return request.build_absolute_uri(url) if request else url


def refuse_colour_size(serializer: serializers.Serializer) -> None:
    """Free-text colour and size are gone; a client still sending them must hear it."""
    sent = [name for name in ("color", "size") if name in serializer.initial_data]
    if sent:
        raise serializers.ValidationError(
            {name: ["Not accepted any more. Send option_value_ids."] for name in sent}
        )


def validate_discount_below_price(attrs: dict) -> dict:
    """Guard both create and update forms: a discount at or above list price is
    silently ignored at checkout, so reject it here instead of storing a lie."""
    price = attrs.get("price")
    discount = attrs.get("discount_price")
    if price is not None and discount is not None and discount >= price:
        raise serializers.ValidationError(
            {"discount_price": ["Discount price must be lower than the price."]}
        )
    return attrs


# What a row of one kind carries in the other kind's fields: nothing.
PREORDER_FIELD_BLANKS = {
    "is_preorder_enabled": False,
    "preorder_price": None,
    "preorder_start_date": None,
    "preorder_end_date": None,
    "release_date": None,
    "preorder_stock_limit": None,
    "preorder_min_quantity": None,
    "is_preorder_active": False,
    "can_preorder": False,
    "is_preorder_price_applied": False,
}
STOCK_FIELD_BLANKS = {
    "barcode": "",
    "discount_price": None,
    "wholesale_price": None,
    "show_wholesale_price": False,
    "is_low_stock": False,
}


class ProductVariantSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    product_id = serializers.UUIDField(read_only=True)
    product_code = serializers.CharField(source="product.product_code", read_only=True)
    category_type = serializers.CharField(source="product.category.category_type", read_only=True)
    product_name = serializers.SerializerMethodField()
    sku = serializers.CharField()
    barcode = serializers.CharField(allow_blank=True)
    price = serializers.DecimalField(max_digits=12, decimal_places=2)
    cost_price = serializers.DecimalField(max_digits=12, decimal_places=2)
    discount_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True, required=False
    )
    weight = serializers.DecimalField(max_digits=10, decimal_places=3, allow_null=True)
    is_active = serializers.BooleanField()
    title = serializers.SerializerMethodField()
    option_values = serializers.SerializerMethodField()
    color = serializers.SerializerMethodField()
    size = serializers.SerializerMethodField()
    # Wholesale fields
    wholesale_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True, required=False
    )
    show_wholesale_price = serializers.BooleanField()
    # Pre-order fields
    is_preorder_enabled = serializers.BooleanField()
    preorder_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True, required=False
    )
    preorder_start_date = serializers.DateTimeField(allow_null=True, required=False)
    preorder_end_date = serializers.DateTimeField(allow_null=True, required=False)
    release_date = serializers.DateTimeField(allow_null=True, required=False)
    preorder_stock_limit = serializers.IntegerField(
        allow_null=True, required=False, min_value=0
    )
    preorder_min_quantity = serializers.IntegerField(required=False, min_value=1)
    is_preorder_active = serializers.SerializerMethodField()
    can_preorder = serializers.SerializerMethodField()
    effective_price = serializers.SerializerMethodField()
    is_preorder_price_applied = serializers.SerializerMethodField()
    stock = serializers.SerializerMethodField()
    is_low_stock = serializers.SerializerMethodField()
    primary_image = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()

    def to_representation(self, instance) -> dict:
        data = super().to_representation(instance)
        data.update(STOCK_FIELD_BLANKS if instance.is_preorder_kind else PREORDER_FIELD_BLANKS)
        return data

    def get_title(self, obj) -> str:
        return variant_title(obj)

    def get_option_values(self, obj) -> list[dict]:
        return [
            {**pair, "option_id": str(pair["option_id"]), "value_id": str(pair["value_id"])}
            for pair in variant_option_values(obj)
        ]

    def get_color(self, obj) -> str:
        return variant_legacy_field(obj, COLOUR_NAMES)

    def get_size(self, obj) -> str:
        return variant_legacy_field(obj, SIZE_NAMES)

    def get_is_preorder_active(self, obj) -> bool:
        return obj.is_preorder_active

    def get_can_preorder(self, obj) -> bool:
        if not obj.is_preorder_active:
            return False
        if obj.preorder_stock_limit is None:
            return True
        # Use pre-fetched preordered quantities from context to avoid N+1 queries
        preordered_by_variant = self.context.get("preordered_by_variant")
        if preordered_by_variant is not None:
            preordered = preordered_by_variant.get(obj.id, 0)
        else:
            preordered = obj._get_preordered_quantity()
        return preordered < obj.preorder_stock_limit

    def get_effective_price(self, obj) -> str:
        return str(obj.effective_price)

    def get_is_preorder_price_applied(self, obj) -> bool:
        return obj.is_preorder_price_applied

    def get_product_name(self, obj) -> str:
        return obj.product.name

    def get_images(self, obj) -> list[dict]:
        return ProductImageSerializer(obj.images.all(), many=True).data

    def get_stock(self, obj) -> int:
        # The view populates `stock_by_variant` in serializer context (one
        # batch query for the whole list) to avoid an N+1 query per row;
        # detail responses without that context fall back to a single lookup.
        stock_by_variant = self.context.get("stock_by_variant")
        if stock_by_variant is not None:
            return stock_by_variant.get(obj.id, 0)
        return available_quantities_for_variants([obj.id]).get(obj.id, 0)

    def get_is_low_stock(self, obj) -> bool:
        if obj.is_preorder_kind:
            return False
        reorder_point_by_variant = self.context.get("reorder_point_by_variant")
        if reorder_point_by_variant is not None:
            reorder_point = reorder_point_by_variant.get(obj.id, 0)
        else:
            reorder_point = reorder_points_for_variants([obj.id]).get(obj.id, 0)
        return self.get_stock(obj) <= reorder_point

    def get_primary_image(self, obj) -> str | None:
        return variant_image_url(obj)


class ProductVariantCreateSerializer(serializers.Serializer):
    sku = serializers.CharField(required=False, allow_blank=True)
    barcode = serializers.CharField(required=False, allow_blank=True)
    # Omitted price inherits from a sibling variant — all variants share one price.
    price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    cost_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    discount_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    weight = serializers.DecimalField(
        max_digits=10, decimal_places=3, required=False, allow_null=True
    )
    option_value_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, max_length=3
    )
    # Wholesale fields
    wholesale_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    show_wholesale_price = serializers.BooleanField(required=False, default=False)
    # Pre-order fields
    is_preorder_enabled = serializers.BooleanField(required=False, default=False)
    preorder_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    preorder_start_date = serializers.DateTimeField(required=False, allow_null=True)
    preorder_end_date = serializers.DateTimeField(required=False, allow_null=True)
    release_date = serializers.DateTimeField(required=False, allow_null=True)
    preorder_stock_limit = serializers.IntegerField(
        required=False, allow_null=True, min_value=0
    )
    preorder_min_quantity = serializers.IntegerField(required=False, min_value=1)

    def validate(self, attrs):
        refuse_colour_size(self)
        attrs = validate_discount_below_price(attrs)
        self._validate_preorder_fields(attrs)
        return attrs

    def _validate_preorder_fields(self, attrs: dict) -> None:
        is_preorder_enabled = attrs.get("is_preorder_enabled", False)
        if not is_preorder_enabled:
            return

        price = attrs.get("price")
        preorder_price = attrs.get("preorder_price")
        preorder_start_date = attrs.get("preorder_start_date")
        preorder_end_date = attrs.get("preorder_end_date")
        release_date = attrs.get("release_date")

        if preorder_price is not None and price is not None and preorder_price >= price:
            raise serializers.ValidationError(
                {"preorder_price": ["Pre-order price must be lower than the normal price."]}
            )

        if preorder_start_date and preorder_end_date and preorder_start_date >= preorder_end_date:
            raise serializers.ValidationError(
                {"preorder_end_date": ["Pre-order end date must be after start date."]}
            )

        if preorder_end_date and release_date and preorder_end_date > release_date:
            raise serializers.ValidationError(
                {"release_date": ["Release date must be on or after pre-order end date."]}
            )


class ProductVariantUpdateSerializer(serializers.Serializer):
    sku = serializers.CharField(required=False)
    barcode = serializers.CharField(required=False, allow_blank=True)
    price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    cost_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    discount_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    weight = serializers.DecimalField(
        max_digits=10, decimal_places=3, required=False, allow_null=True
    )
    option_value_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, max_length=3
    )
    is_active = serializers.BooleanField(required=False)
    # Wholesale fields
    wholesale_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    show_wholesale_price = serializers.BooleanField(required=False)
    # Pre-order fields
    is_preorder_enabled = serializers.BooleanField(required=False)
    preorder_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    preorder_start_date = serializers.DateTimeField(required=False, allow_null=True)
    preorder_end_date = serializers.DateTimeField(required=False, allow_null=True)
    release_date = serializers.DateTimeField(required=False, allow_null=True)
    preorder_stock_limit = serializers.IntegerField(
        required=False, allow_null=True, min_value=0
    )
    preorder_min_quantity = serializers.IntegerField(required=False, min_value=1)

    def validate(self, attrs):
        refuse_colour_size(self)
        attrs = validate_discount_below_price(attrs)
        self._validate_preorder_fields(attrs)
        return attrs

    def _validate_preorder_fields(self, attrs: dict) -> None:
        is_preorder_enabled = attrs.get("is_preorder_enabled", False)
        if not is_preorder_enabled:
            return

        price = attrs.get("price")
        preorder_price = attrs.get("preorder_price")
        preorder_start_date = attrs.get("preorder_start_date")
        preorder_end_date = attrs.get("preorder_end_date")
        release_date = attrs.get("release_date")

        if preorder_price is not None and price is not None and preorder_price >= price:
            raise serializers.ValidationError(
                {"preorder_price": ["Pre-order price must be lower than the normal price."]}
            )

        if preorder_start_date and preorder_end_date and preorder_start_date >= preorder_end_date:
            raise serializers.ValidationError(
                {"preorder_end_date": ["Pre-order end date must be after start date."]}
            )

        if preorder_end_date and release_date and preorder_end_date > release_date:
            raise serializers.ValidationError(
                {"release_date": ["Release date must be on or after pre-order end date."]}
            )


class VariantGenerateSerializer(serializers.Serializer):
    combinations = serializers.ListField(
        child=serializers.ListField(child=serializers.UUIDField(), max_length=3), required=False
    )
    price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    cost_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)


class VariantBulkUpdateSerializer(serializers.Serializer):
    variant_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, allow_empty=False
    )
    price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    discount_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    cost_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    is_active = serializers.BooleanField(required=False)

    def validate(self, attrs):
        return validate_discount_below_price(attrs)


class OptionLabelField(serializers.CharField):
    def __init__(self, **kwargs):
        super().__init__(max_length=50, **kwargs)


class OptionValueWriteSerializer(serializers.Serializer):
    id = serializers.CharField(required=False)
    value = OptionLabelField()


class OptionWriteSerializer(serializers.Serializer):
    id = serializers.CharField(required=False)
    name = OptionLabelField()
    default_value = OptionLabelField(required=False, allow_blank=True)
    values = OptionValueWriteSerializer(many=True, required=False)


class ProductOptionsWriteSerializer(serializers.Serializer):
    options = OptionWriteSerializer(many=True)


class NewProductOptionSerializer(serializers.Serializer):
    name = OptionLabelField()
    values = serializers.ListField(child=OptionLabelField(), required=False)


class ShopOptionSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField()
    is_active = serializers.BooleanField()
    values = serializers.SerializerMethodField()

    def get_values(self, obj) -> list[str]:
        return [value.value for value in obj.values.all()]


class ShopOptionWriteSerializer(serializers.Serializer):
    name = OptionLabelField()
    values = serializers.ListField(child=OptionLabelField())


class ShopOptionUpdateSerializer(serializers.Serializer):
    name = OptionLabelField(required=False)
    is_active = serializers.BooleanField(required=False)
    values = serializers.ListField(child=OptionLabelField(), required=False)


class SpecSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    value = serializers.CharField(max_length=500)


def validate_specs(specs: list[dict]) -> list[dict]:
    names = [" ".join(row["name"].split()).casefold() for row in specs]
    if len(names) != len(set(names)):
        raise serializers.ValidationError("Two specifications have the same name.")
    return specs


def serialize_options(product, **kwargs) -> list[dict]:
    return [
        {
            "id": str(option["id"]),
            "name": option["name"],
            "position": option["position"],
            "values": [
                {"id": str(value["id"]), "value": value["value"], "position": value["position"]}
                for value in option["values"]
            ],
        }
        for option in product_options(product, **kwargs)
    ]


class CategorySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField()
    slug = serializers.CharField(read_only=True)
    parent_id = serializers.UUIDField(allow_null=True, read_only=True)
    description = serializers.CharField(allow_blank=True)
    category_type = serializers.ChoiceField(choices=Category.CategoryType.choices, read_only=True)
    is_active = serializers.BooleanField()
    image = serializers.SerializerMethodField()
    deleted_at = serializers.DateTimeField(read_only=True, allow_null=True)

    def get_image(self, obj) -> str | None:
        return _image_url(obj, self.context)


class _DefaultOnBooleanField(serializers.BooleanField):
    # DRF reads a boolean missing from a multipart form as an unticked checkbox
    # (False); left out, this one takes its default instead.
    default_empty_html = empty


class CategoryCreateSerializer(serializers.Serializer):
    name = serializers.CharField()
    parent_id = serializers.UUIDField(required=False, allow_null=True)
    description = serializers.CharField(required=False, allow_blank=True)
    # Omitted for a subcategory (inherits its parent's type); required in effect
    # only for a root category, where it defaults to Stock if left out.
    category_type = serializers.ChoiceField(choices=Category.CategoryType.choices, required=False)
    # Off creates the category hidden from the storefront.
    is_active = _DefaultOnBooleanField(required=False, default=True)


class CategoryUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(required=False)
    parent_id = serializers.UUIDField(required=False, allow_null=True)
    description = serializers.CharField(required=False, allow_blank=True)
    # Only settable on a root category — a subcategory's type is locked to its
    # parent's and is rejected by the service layer if sent directly.
    category_type = serializers.ChoiceField(choices=Category.CategoryType.choices, required=False)
    is_active = serializers.BooleanField(required=False)
    image = serializers.ImageField(required=False)


class ProductSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    product_code = serializers.CharField(read_only=True)
    category_id = serializers.UUIDField(read_only=True)
    category_type = serializers.CharField(source="category.category_type", read_only=True)
    brand_id = serializers.UUIDField(read_only=True, allow_null=True)
    featured = serializers.BooleanField(read_only=True)
    show_questions = serializers.BooleanField(read_only=True)
    show_price_report = serializers.BooleanField(read_only=True)
    name = serializers.CharField()
    slug = serializers.CharField(read_only=True)
    description = serializers.CharField(allow_blank=True)
    product_type = serializers.ChoiceField(choices=Product.ProductType.choices, read_only=True)
    highlights = serializers.ListField(child=serializers.CharField(), required=False)
    specs = serializers.SerializerMethodField()
    meta_keywords = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField()
    deleted_at = serializers.DateTimeField(read_only=True, allow_null=True)
    options = serializers.SerializerMethodField()
    variants = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    primary_image = serializers.SerializerMethodField()
    total_stock = serializers.SerializerMethodField()
    price = serializers.SerializerMethodField()
    cost_price = serializers.SerializerMethodField()
    discount_price = serializers.SerializerMethodField()
    added_by = serializers.SerializerMethodField()
    units_sold = serializers.SerializerMethodField()
    average_rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()

    def get_image(self, obj) -> str | None:
        return _image_url(obj, self.context)

    def get_added_by(self, obj) -> str | None:
        return added_by_label(obj)

    # These three come from the view's batch lookups; a caller without them gets blanks.
    def get_units_sold(self, obj) -> int:
        return self.context.get("sold_by_product", {}).get(obj.id, 0)

    def get_average_rating(self, obj) -> float | None:
        summary = self.context.get("rating_by_product", {}).get(obj.id)
        return summary["average_rating"] if summary else None

    def get_review_count(self, obj) -> int:
        summary = self.context.get("rating_by_product", {}).get(obj.id)
        return summary["review_count"] if summary else 0

    def get_specs(self, obj) -> list[dict]:
        return product_specs(obj)

    def get_options(self, obj) -> list[dict]:
        return serialize_options(obj)

    def get_variants(self, obj) -> list[dict]:
        return ProductVariantSerializer(obj.active_variants, many=True, context=self.context).data

    @staticmethod
    def _representative_variant(obj):
        variants = getattr(obj, "active_variants", None)
        if variants is None:
            variants = list(obj.variants.filter(deleted_at__isnull=True).order_by("created_at"))
        return variants[0] if variants else None

    def get_price(self, obj) -> str | None:
        variant = self._representative_variant(obj)
        return str(variant.price) if variant else None

    def get_cost_price(self, obj) -> str | None:
        variant = self._representative_variant(obj)
        return str(variant.cost_price) if variant else None

    def get_discount_price(self, obj) -> str | None:
        variant = self._representative_variant(obj)
        if variant is None or variant.discount_price is None:
            return None
        if obj.category.category_type == Category.CategoryType.PREORDER:
            return None
        return str(variant.discount_price)

    def get_images(self, obj) -> list[dict]:
        return ProductImageSerializer(obj.images.all(), many=True).data

    def get_primary_image(self, obj) -> str | None:
        # Falls back to a variant's image, matching the storefront — otherwise a
        # product whose photos hang off its variations shows a blank thumbnail
        # here while the shop displays them fine.
        image = next(iter(obj.images.all()), None)
        if image is None:
            for variant in getattr(obj, "active_variants", None) or obj.variants.all():
                image = next(iter(variant.images.all()), None)
                if image is not None:
                    break
        return image.url if image else None

    def get_total_stock(self, obj) -> int | None:
        if obj.category.category_type == Category.CategoryType.PREORDER:
            return None
        stock_by_variant = self.context.get("stock_by_variant")
        variant_ids = [v.id for v in obj.active_variants]
        if stock_by_variant is not None:
            return sum(stock_by_variant.get(vid, 0) for vid in variant_ids)
        return sum(available_quantities_for_variants(variant_ids).values())


class ProductCreateSerializer(serializers.Serializer):
    category_id = serializers.UUIDField()
    brand_id = serializers.UUIDField(required=False, allow_null=True)
    featured = serializers.BooleanField(required=False, default=False)
    show_questions = serializers.BooleanField(required=False, default=True)
    show_price_report = serializers.BooleanField(required=False, default=True)
    # Off creates the product unpublished, so it can be finished before the storefront shows it.
    is_active = serializers.BooleanField(required=False, default=True)
    name = serializers.CharField()
    description = serializers.CharField(required=False, allow_blank=True)
    highlights = serializers.ListField(child=serializers.CharField(), required=False)
    specs = SpecSerializer(many=True, required=False)
    options = NewProductOptionSerializer(many=True, required=False)
    combinations = serializers.ListField(
        child=serializers.ListField(child=serializers.CharField(), max_length=3), required=False
    )
    meta_keywords = serializers.CharField(required=False, allow_blank=True)
    # Supplying a price creates the product's single variant in the same call,
    # so a simple product is never left priceless and unsellable.
    price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    cost_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, default=0
    )
    discount_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    sku = serializers.CharField(required=False, allow_blank=True)

    def validate_specs(self, specs):
        return validate_specs(specs)

    def validate(self, attrs):
        return validate_discount_below_price(attrs)


class ProductUpdateSerializer(serializers.Serializer):
    category_id = serializers.UUIDField(required=False)
    brand_id = serializers.UUIDField(required=False, allow_null=True)
    featured = serializers.BooleanField(required=False)
    show_questions = serializers.BooleanField(required=False)
    show_price_report = serializers.BooleanField(required=False)
    name = serializers.CharField(required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    highlights = serializers.ListField(child=serializers.CharField(), required=False)
    specs = SpecSerializer(many=True, required=False)
    meta_keywords = serializers.CharField(required=False, allow_blank=True)
    price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    cost_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    discount_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    is_active = serializers.BooleanField(required=False)
    image = serializers.ImageField(required=False)

    def validate_specs(self, specs):
        return validate_specs(specs)

    def validate(self, attrs):
        return validate_discount_below_price(attrs)


class ProductImageSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    product_id = serializers.UUIDField(read_only=True, allow_null=True)
    variant_id = serializers.UUIDField(read_only=True, allow_null=True)
    option_value_id = serializers.UUIDField(read_only=True, allow_null=True)
    url = serializers.CharField()
    alt_text = serializers.CharField(required=False, allow_blank=True)
    sort_order = serializers.IntegerField(required=False)


class ProductImageCreateSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField(required=False, allow_null=True)
    option_value_id = serializers.UUIDField(required=False, allow_null=True)
    url = serializers.CharField()
    alt_text = serializers.CharField(required=False, allow_blank=True, default="")
    sort_order = serializers.IntegerField(required=False, default=0)


class ProductImageUpdateSerializer(serializers.Serializer):
    option_value_id = serializers.UUIDField(required=False, allow_null=True)
    url = serializers.CharField(required=False)
    alt_text = serializers.CharField(required=False, allow_blank=True)
    sort_order = serializers.IntegerField(required=False)


class ProductBulkStatusSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)
    is_active = serializers.BooleanField()
    category_type = serializers.ChoiceField(choices=Category.CategoryType.choices, required=False)


class BrandSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField()
    slug = serializers.CharField(read_only=True)
    kind = serializers.CharField(read_only=True)
    description = serializers.CharField(allow_blank=True)
    is_active = serializers.BooleanField()
    image = serializers.SerializerMethodField()
    deleted_at = serializers.DateTimeField(read_only=True, allow_null=True)

    def get_image(self, obj) -> str | None:
        return _image_url(obj, self.context)


class BrandCreateSerializer(serializers.Serializer):
    name = serializers.CharField()
    description = serializers.CharField(required=False, allow_blank=True)
    kind = serializers.ChoiceField(choices=KINDS, required=False)


class BrandUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(required=False)
    kind = serializers.ChoiceField(choices=KINDS, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)
    image = serializers.ImageField(required=False)


class BrandBulkStatusSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)
    is_active = serializers.BooleanField()
