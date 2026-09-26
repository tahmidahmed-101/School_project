from __future__ import annotations

from rest_framework import status

from apps.common.exceptions import BusinessRuleViolationError
from apps.common.responses import error_from_exception, error_response, not_found


def test_error_response_uses_the_shared_envelope():
    response = error_response("bad_thing", "Bad thing.", {"name": ["Required."]})

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data == {
        "error": {"code": "bad_thing", "message": "Bad thing.", "fields": {"name": ["Required."]}}
    }


def test_not_found_has_a_body():
    response = not_found("product_not_found", "Product not found.")

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.data == {
        "error": {"code": "product_not_found", "message": "Product not found.", "fields": {}}
    }


def test_not_found_defaults():
    assert not_found().data["error"] == {
        "code": "not_found",
        "message": "Not found.",
        "fields": {},
    }


def test_error_from_exception_reads_domain_code_and_message():
    response = error_from_exception(BusinessRuleViolationError("Nope.", code="not_pending"))

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["error"]["code"] == "not_pending"
    assert response.data["error"]["message"] == "Nope."
