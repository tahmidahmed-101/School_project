from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from apps.common.exceptions import DomainError

ERROR_STATUS_CODES = {
    "business_rule_violation": status.HTTP_400_BAD_REQUEST,
    "admin_required": status.HTTP_403_FORBIDDEN,
    "auth_invalid_credentials": status.HTTP_401_UNAUTHORIZED,
    "auth_invalid_refresh": status.HTTP_401_UNAUTHORIZED,
}

# Suffix/prefix fallbacks so new domain codes get a sane status without being
# enumerated one by one. Checked in order; first match wins.
ERROR_STATUS_PATTERNS: tuple[tuple[str, int], ...] = (
    ("_not_found", status.HTTP_404_NOT_FOUND),
    ("_already_exists", status.HTTP_409_CONFLICT),
    ("_exists", status.HTTP_409_CONFLICT),
    ("_in_use", status.HTTP_409_CONFLICT),
    ("_mismatch", status.HTTP_409_CONFLICT),
)

ERROR_STATUS_PREFIXES: tuple[tuple[str, int], ...] = (
    ("duplicate", status.HTTP_409_CONFLICT),
    ("already_", status.HTTP_409_CONFLICT),
)


def status_for_code(code: str) -> int:
    if code in ERROR_STATUS_CODES:
        return ERROR_STATUS_CODES[code]
    for suffix, status_code in ERROR_STATUS_PATTERNS:
        if code.endswith(suffix):
            return status_code
    for prefix, status_code in ERROR_STATUS_PREFIXES:
        if code.startswith(prefix):
            return status_code
    return status.HTTP_400_BAD_REQUEST


def custom_exception_handler(exc: Exception, context: dict) -> Response | None:
    """Central DRF exception handler producing a single error envelope:
    `{"error": {"code": str, "message": str, "fields": dict}}`.

    New views built on `apps.common.generics` (or any view) can simply raise
    `DomainError`/`BusinessRuleViolationError` and let this handler format the
    response, instead of wrapping every call in a try/except.
    """
    if isinstance(exc, DomainError):
        status_code = status_for_code(exc.code)
        return Response(
            {"error": {"code": exc.code, "message": exc.message, "fields": {}}},
            status=status_code,
        )

    response = drf_exception_handler(exc, context)
    if response is None:
        return None

    detail = response.data
    fields: dict = {}
    if isinstance(detail, dict):
        if "detail" in detail:
            message = str(detail["detail"])
        else:
            fields = {
                field: value if isinstance(value, list) else [value]
                for field, value in detail.items()
            }
            message = "Validation failed."
    elif isinstance(detail, list):
        message = "; ".join(str(item) for item in detail)
    else:
        message = str(detail)

    code = getattr(exc, "default_code", None) or "error"
    response.data = {"error": {"code": code, "message": message, "fields": fields}}
    return response
