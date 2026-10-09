from __future__ import annotations

from rest_framework import serializers

from apps.catalog.selectors.options import variant_title


class VariantTitleField(serializers.ReadOnlyField):
    """The option values of the row's variant, e.g. "Red / M". Reads `obj.variant`."""

    def __init__(self, **kwargs):
        super().__init__(source="variant", **kwargs)

    def to_representation(self, value) -> str:
        return variant_title(value)
