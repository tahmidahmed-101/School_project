from __future__ import annotations

from rest_framework import serializers

from apps.orders.constants import PaymentMethodKey


class DateRangeSerializer(serializers.Serializer):
    """Shared `?start=&end=` window for report endpoints.

    Defined once because two identical copies under the same class name
    collide in the OpenAPI schema, where one silently overwrites the other.
    """

    start = serializers.DateField()
    end = serializers.DateField()


class CapturePaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    method = serializers.ChoiceField(
        choices=PaymentMethodKey.choices, required=False, default=PaymentMethodKey.MANUAL
    )
