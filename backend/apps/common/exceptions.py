class DomainError(Exception):
    default_code = "domain_error"

    def __init__(self, message: str, *, code: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.code = code or self.default_code


class BusinessRuleViolationError(DomainError):
    default_code = "business_rule_violation"


# Alias for compatibility across domain services
BusinessRuleViolation = BusinessRuleViolationError
