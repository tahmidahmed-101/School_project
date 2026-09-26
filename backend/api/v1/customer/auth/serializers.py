from __future__ import annotations

from rest_framework import serializers


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    remember_me = serializers.BooleanField(required=False, default=False)


class VerifyEmailSerializer(serializers.Serializer):
    code = serializers.CharField(min_length=6, max_length=6)


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(min_length=6, max_length=6)
    new_password = serializers.CharField(write_only=True, min_length=8)


class UserSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    email = serializers.EmailField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    role = serializers.CharField()
    phone = serializers.CharField()
    profile_picture = serializers.CharField(allow_blank=True)
    is_email_verified = serializers.BooleanField()
    is_phone_verified = serializers.BooleanField()
    permissions = serializers.ListField(child=serializers.CharField())


class PhoneVerificationCodeSerializer(serializers.Serializer):
    code = serializers.CharField(min_length=6, max_length=6)


class RequestPhoneChangeSerializer(serializers.Serializer):
    new_phone = serializers.CharField()


class ConfirmPhoneChangeSerializer(serializers.Serializer):
    code = serializers.CharField(min_length=6, max_length=6)
    new_phone = serializers.CharField()
