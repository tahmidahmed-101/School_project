from __future__ import annotations

from rest_framework import serializers


class AuditLogSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    actor = serializers.SerializerMethodField()
    action = serializers.CharField()
    target_type = serializers.CharField(allow_blank=True)
    target_id = serializers.CharField(allow_blank=True)
    ip_address = serializers.CharField(allow_null=True)
    metadata = serializers.JSONField()
    created_at = serializers.DateTimeField()

    def get_actor(self, obj) -> str | None:
        return obj.actor.email if obj.actor_id else None


class LoginHistorySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    email = serializers.CharField(allow_blank=True)
    ip_address = serializers.CharField(allow_null=True)
    was_successful = serializers.BooleanField()
    created_at = serializers.DateTimeField()
