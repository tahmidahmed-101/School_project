from __future__ import annotations

from django.core.validators import RegexValidator

validate_phone_number = RegexValidator(
    regex=r"^\+?[1-9]\d{6,14}$",
    message="Enter a valid phone number (E.164-style, e.g. +15551234567).",
)
