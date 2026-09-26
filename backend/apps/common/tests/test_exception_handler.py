from __future__ import annotations

from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.views import APIView

from apps.common.exception_handler import custom_exception_handler
from apps.common.exceptions import BusinessRuleViolationError


def _context():
    return {"view": APIView()}


def test_domain_error_becomes_error_envelope():
    exc = BusinessRuleViolationError("Something went wrong.", code="admin_required")

    response = custom_exception_handler(exc, _context())

    assert response is not None
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.data == {
        "error": {"code": "admin_required", "message": "Something went wrong.", "fields": {}}
    }


def test_domain_error_defaults_to_400_for_unknown_code():
    exc = BusinessRuleViolationError("Bad input.", code="something_custom")

    response = custom_exception_handler(exc, _context())

    assert response is not None
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["error"]["code"] == "something_custom"


def test_validation_error_is_normalized_with_field_errors():
    exc = ValidationError({"email": ["This field is required."]})

    response = custom_exception_handler(exc, _context())

    assert response is not None
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["error"]["message"] == "Validation failed."
    assert response.data["error"]["fields"] == {"email": ["This field is required."]}


def test_unhandled_exception_falls_through_to_none():
    assert custom_exception_handler(ValueError("boom"), _context()) is None


def test_not_found_code_suffix_maps_to_404():
    exc = BusinessRuleViolationError("No such product.", code="product_not_found")

    response = custom_exception_handler(exc, _context())

    assert response is not None
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.data["error"]["code"] == "product_not_found"


def test_conflict_codes_map_to_409():
    for code in ("duplicate_sku", "already_paid", "profile_exists", "supplier_in_use"):
        response = custom_exception_handler(
            BusinessRuleViolationError("Nope.", code=code), _context()
        )

        assert response is not None
        assert response.status_code == status.HTTP_409_CONFLICT, code


def test_explicit_mapping_wins_over_suffix():
    response = custom_exception_handler(
        BusinessRuleViolationError("Nope.", code="admin_required"), _context()
    )

    assert response is not None
    assert response.status_code == status.HTTP_403_FORBIDDEN
