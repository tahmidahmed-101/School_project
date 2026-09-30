from __future__ import annotations

from apps.common.exceptions import BusinessRuleViolationError


class CourierError(BusinessRuleViolationError):
    """Anything that stopped a courier call from succeeding. Subclasses
    BusinessRuleViolationError so the DRF handler already renders it."""

    default_code = "courier_api_error"


class CourierNotConfiguredError(CourierError):
    default_code = "integration_not_configured"


class CourierUnavailableError(CourierError):
    """Network failure or timeout — the request may or may not have landed."""

    default_code = "courier_unavailable"


class CourierAuthError(CourierError):
    default_code = "courier_auth_failed"


class CourierRateLimitedError(CourierError):
    default_code = "courier_rate_limited"


class CourierRejectedError(CourierError):
    default_code = "courier_rejected"
