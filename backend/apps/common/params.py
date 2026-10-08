from __future__ import annotations

from collections.abc import Iterable
from datetime import date
from uuid import UUID

from django.utils.dateparse import parse_date
from rest_framework.exceptions import ValidationError

from apps.common.pagination import MAX_SEARCH_LENGTH


def _fail(name: str, message: str) -> None:
    raise ValidationError({name: [message]})


def get_date(params, name: str, default: date | None = None) -> date | None:
    raw = params.get(name)
    if raw in (None, ""):
        return default
    parsed = parse_date(raw)
    if parsed is None:
        _fail(name, "Enter a valid date in YYYY-MM-DD format.")
    return parsed


def get_uuid(params, name: str, default: str | None = None) -> str | None:
    """Validate a UUID query param but hand back the raw string, which is what
    the selectors take."""
    raw = params.get(name)
    if raw in (None, ""):
        return default
    try:
        UUID(str(raw))
    except (TypeError, ValueError):
        _fail(name, "Enter a valid UUID.")
    return raw


def get_related(params, name: str, resolver, message: str | None = None):
    """Resolve a foreign-key filter param to an instance, or `None` when absent.

    A supplied-but-unresolvable id is a 400, never `None` — passing `None` on
    would drop the filter and return the whole table.
    """
    raw = get_uuid(params, name)
    if raw is None:
        return None
    instance = resolver(raw)
    if instance is None:
        _fail(name, message or "No matching record for this id.")
    return instance


def get_choice(params, name: str, choices: Iterable[str], default: str | None = None) -> str | None:
    raw = params.get(name)
    if raw in (None, ""):
        return default
    allowed = list(choices)
    if raw not in allowed:
        _fail(name, f"Must be one of: {', '.join(str(choice) for choice in allowed)}.")
    return raw


KIND_STOCK = "stock"
KIND_PREORDER = "preorder"
KINDS = (KIND_STOCK, KIND_PREORDER)


def get_kind(params) -> str | None:
    return get_choice(params, "kind", KINDS)


def get_bool(params, name: str, default: bool | None = None) -> bool | None:
    raw = params.get(name)
    if raw in (None, ""):
        return default
    lowered = str(raw).lower()
    if lowered in ("true", "1", "yes"):
        return True
    if lowered in ("false", "0", "no"):
        return False
    _fail(name, "Enter a valid boolean (true or false).")
    return None


def get_int(
    params, name: str, default: int | None = None, *, min_value: int, max_value: int
) -> int | None:
    """Bounded on both sides: an unbounded int param on a public endpoint is a
    caller-chosen query size."""
    raw = params.get(name)
    if raw in (None, ""):
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        value = None
    if value is None or not min_value <= value <= max_value:
        _fail(name, f"Enter a whole number between {min_value} and {max_value}.")
    return value


def get_search(params, name: str = "search") -> str | None:
    raw = params.get(name)
    if not raw:
        return None
    if len(raw) > MAX_SEARCH_LENGTH:
        _fail(name, f"Must be at most {MAX_SEARCH_LENGTH} characters.")
    return raw


def validate_date_range(start: date | None, end: date | None) -> None:
    if start and end and start > end:
        raise ValidationError({"end": ["Must be on or after start."]})
