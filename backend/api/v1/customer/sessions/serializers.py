from __future__ import annotations

from rest_framework import serializers


class SessionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    created_at = serializers.DateTimeField()
    expires_at = serializers.DateTimeField()


class RevokeOtherSessionsSerializer(serializers.Serializer):
    refresh = serializers.CharField()
