from __future__ import annotations

from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator

validate_phone_number = RegexValidator(
    regex=r"^\+?[1-9]\d{6,14}$",
    message="Enter a valid phone number (E.164-style, e.g. +15551234567).",
)


def validate_file_size(max_mb: float):
    max_bytes = max_mb * 1024 * 1024

    def _validate(file) -> None:
        if file.size > max_bytes:
            raise ValidationError(f"File must be {max_mb}MB or smaller.")

    return _validate


def validate_file_extension(allowed_extensions: tuple[str, ...]):
    normalized = {ext.lower().lstrip(".") for ext in allowed_extensions}

    def _validate(file) -> None:
        extension = file.name.rsplit(".", 1)[-1].lower() if "." in file.name else ""
        if extension not in normalized:
            raise ValidationError(
                f"Unsupported file type '.{extension}'. Allowed: {', '.join(sorted(normalized))}."
            )

    return _validate
