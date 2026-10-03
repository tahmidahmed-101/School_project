from __future__ import annotations

from rest_framework import serializers

from apps.accounts.constants import UserRole


class AdminAddressSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    address_type = serializers.ChoiceField(
        choices=("shipping", "billing", "other"),
        required=False,
        default="shipping",
    )
    full_name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=32)
    line1 = serializers.CharField(max_length=255)
    line2 = serializers.CharField(max_length=255, required=False, allow_blank=True)
    delivery_note = serializers.CharField(source="line2", read_only=True, allow_blank=True)
    city = serializers.CharField(max_length=100, required=False, allow_blank=True)
    state = serializers.CharField(max_length=100, required=False, allow_blank=True)
    postal_code = serializers.CharField(max_length=32, required=False, allow_blank=True)
    country = serializers.CharField(max_length=100)
    is_default = serializers.BooleanField(required=False)


class AdminUserSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    email = serializers.EmailField()
    first_name = serializers.CharField(allow_blank=True)
    last_name = serializers.CharField(allow_blank=True)
    display_name = serializers.CharField(read_only=True, allow_blank=True)
    role = serializers.ChoiceField(choices=UserRole.choices)
    phone = serializers.CharField(allow_blank=True)
    contact_phone = serializers.CharField(read_only=True, allow_blank=True)
    profile_picture = serializers.CharField(allow_blank=True)
    is_active = serializers.BooleanField()
    is_email_verified = serializers.BooleanField()
    is_phone_verified = serializers.BooleanField()
    is_superuser = serializers.BooleanField()
    # Guest-checkout identity, not an account; set only by guest checkout.
    is_guest = serializers.BooleanField(read_only=True)
    date_joined = serializers.DateTimeField(read_only=True)
    last_login = serializers.DateTimeField(read_only=True, allow_null=True)
    permissions = serializers.ListField(child=serializers.CharField())
    deleted_at = serializers.DateTimeField(read_only=True, allow_null=True)
    order_summary = serializers.DictField(required=False, read_only=True)


class AdminUserCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    role = serializers.ChoiceField(choices=UserRole.choices, default=UserRole.CUSTOMER)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    profile_picture = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False, default=True)


class AdminUserUpdateSerializer(serializers.Serializer):
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    profile_picture = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)
    is_email_verified = serializers.BooleanField(required=False)
    is_phone_verified = serializers.BooleanField(required=False)


class PasswordResetSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True, min_length=8)


class SetRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=UserRole.choices)


class BulkUserIdsSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)
