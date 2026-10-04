from __future__ import annotations

from rest_framework import serializers


class NotificationSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    kind = serializers.CharField(read_only=True)
    title = serializers.CharField(read_only=True)
    message = serializers.CharField(read_only=True)
    object_id = serializers.UUIDField(read_only=True, allow_null=True)
    is_read = serializers.SerializerMethodField()
    read_at = serializers.DateTimeField(read_only=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)

    def get_is_read(self, obj) -> bool:
        return obj.read_at is not None
