from __future__ import annotations

from rest_framework import serializers


class ReviewImagesField(serializers.ListField):
    """Takes uploaded files in, gives the stored pictures' URLs out. The files
    are only checked to be files here — size and decoded content are validated
    in `create_review`, which reports them with the shared upload error codes."""

    child = serializers.FileField()

    def to_representation(self, value) -> list[str]:
        return [item.image.url for item in value.all()]


class CustomerReviewSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    product_id = serializers.UUIDField(read_only=True)
    rating = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(required=False, allow_blank=True, default="")
    images = ReviewImagesField(required=False)
    is_verified_purchase = serializers.BooleanField(read_only=True)
    # "pending" while it waits for the shop's approval; "hidden" if staff took it down.
    status = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)


class CustomerReviewUpdateSerializer(serializers.Serializer):
    rating = serializers.IntegerField(min_value=1, max_value=5, required=False)
    comment = serializers.CharField(required=False, allow_blank=True)
