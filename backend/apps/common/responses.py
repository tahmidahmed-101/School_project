from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status as http_status
from rest_framework.response import Response


def error_response(
    code: str,
    message: str,
    fields: dict | None = None,
    status: int = http_status.HTTP_400_BAD_REQUEST,
) -> Response:
    return Response(
        {"error": {"code": code, "message": message, "fields": fields or {}}},
        status=status,
    )


def not_found(code: str = "not_found", message: str = "Not found.") -> Response:
    return error_response(code, message, status=http_status.HTTP_404_NOT_FOUND)


def error_from_exception(
    exc: Exception, status_code: int = http_status.HTTP_400_BAD_REQUEST
) -> Response:
    """Defaults to 400 because most callers report an entity referenced from the
    request *body* — the endpoint's own resource exists, so the payload is what
    is invalid. Pass `status_for_code(exc.code)` for conflict-style codes."""
    code = getattr(exc, "code", None) or "validation_error"
    message = getattr(exc, "message", str(exc))
    if isinstance(exc, DjangoValidationError):
        message = "; ".join(exc.messages)
    return error_response(code, message, status=status_code)
