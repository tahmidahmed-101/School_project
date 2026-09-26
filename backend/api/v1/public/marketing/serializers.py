from __future__ import annotations

from rest_framework import serializers


class NewsletterEmailSerializer(serializers.Serializer):
    email = serializers.EmailField()
