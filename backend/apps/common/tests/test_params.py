from __future__ import annotations

from datetime import date

import pytest
from rest_framework.exceptions import ValidationError

from apps.common.pagination import MAX_SEARCH_LENGTH
from apps.common.params import (
    get_bool,
    get_choice,
    get_date,
    get_search,
    validate_date_range,
)


def test_get_date_parses_and_rejects():
    assert get_date({"start": "2024-01-31"}, "start") == date(2024, 1, 31)
    assert get_date({}, "start") is None

    with pytest.raises(ValidationError) as exc_info:
        get_date({"start": "abc"}, "start")
    assert "start" in exc_info.value.detail


def test_get_choice_rejects_unknown_values():
    assert get_choice({"status": "draft"}, "status", ["draft", "sent"]) == "draft"

    with pytest.raises(ValidationError):
        get_choice({"status": "bogus"}, "status", ["draft", "sent"])


def test_get_bool_parses_common_spellings():
    assert get_bool({"active": "true"}, "active") is True
    assert get_bool({"active": "0"}, "active") is False

    with pytest.raises(ValidationError):
        get_bool({"active": "maybe"}, "active")


def test_get_search_caps_length():
    assert get_search({"search": "shoe"}) == "shoe"
    assert get_search({}) is None

    with pytest.raises(ValidationError):
        get_search({"search": "x" * (MAX_SEARCH_LENGTH + 1)})


def test_validate_date_range():
    validate_date_range(date(2024, 1, 1), date(2024, 2, 1))

    with pytest.raises(ValidationError):
        validate_date_range(date(2024, 2, 1), date(2024, 1, 1))


def test_get_uuid_validates_and_returns_the_raw_string():
    from apps.common.params import get_uuid

    value = "3f0c4a2e-1c9a-4c2a-9a1e-2b7d5f6a8c90"
    assert get_uuid({"product_id": value}, "product_id") == value
    assert get_uuid({}, "product_id") is None

    with pytest.raises(ValidationError):
        get_uuid({"product_id": "abc"}, "product_id")
