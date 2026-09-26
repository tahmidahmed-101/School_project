from __future__ import annotations

from uuid import uuid4

import pytest
from django.db import connection
from django.test import RequestFactory
from django.test.utils import CaptureQueriesContext

from apps.audit.factories import LoginHistoryFactory
from apps.audit.models import LoginHistory
from apps.common.generics import MAX_BULK_IDS, BulkActionMixin

pytestmark = pytest.mark.django_db


class _BulkView(BulkActionMixin):
    pass


def _request(payload):
    request = RequestFactory().post("/", payload, content_type="application/json")
    request.data = payload
    return request


def test_bulk_action_writes_the_batch_with_one_query():
    entries = [LoginHistoryFactory(was_successful=False) for _ in range(3)]
    ids = [str(e.id) for e in entries]

    def mark_successful(entry):
        entry.was_successful = True
        entry.user_agent = "bulk"

    with CaptureQueriesContext(connection) as queries:
        response = _BulkView().bulk_action(
            _request({"ids": ids}),
            queryset_fn=LoginHistory.objects.all,
            action_fn=mark_successful,
            update_fields=["was_successful", "user_agent"],
        )

    updates = [
        q for q in queries.captured_queries if q["sql"].lstrip().upper().startswith("UPDATE")
    ]
    assert len(updates) == 1, "the batch must be written with a single bulk_update"
    assert response.data["data"]["affected"] == 3
    assert LoginHistory.objects.filter(id__in=ids, was_successful=True).count() == 3


def test_bulk_action_without_update_fields_lets_action_fn_write():
    entries = [LoginHistoryFactory(was_successful=False) for _ in range(2)]
    ids = [str(e.id) for e in entries]

    response = _BulkView().bulk_action(
        _request({"ids": ids}),
        queryset_fn=LoginHistory.objects.all,
        action_fn=lambda e: e.delete(),
    )

    assert response.data["data"]["affected"] == 2
    assert not LoginHistory.objects.filter(id__in=ids).exists()


def test_bulk_action_rejects_an_empty_id_list():
    response = _BulkView().bulk_action(
        _request({"ids": []}),
        queryset_fn=LoginHistory.objects.all,
        action_fn=lambda e: None,
        update_fields=["was_successful"],
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "invalid_ids"


def test_bulk_action_ignores_ids_outside_the_scoped_queryset():
    mine = LoginHistoryFactory(was_successful=False)
    theirs = LoginHistoryFactory(was_successful=False)

    response = _BulkView().bulk_action(
        _request({"ids": [str(mine.id), str(theirs.id)]}),
        queryset_fn=lambda: LoginHistory.objects.filter(id=mine.id),
        action_fn=lambda e: setattr(e, "was_successful", True),
        update_fields=["was_successful"],
    )

    assert response.data["data"]["affected"] == 1
    theirs.refresh_from_db()
    assert theirs.was_successful is False


def test_bulk_action_refuses_an_oversized_id_list():
    """DATA_UPLOAD_MAX_NUMBER_FIELDS does not apply to a JSON body, so the only
    thing standing between a caller and an unbounded IN query is this cap."""
    ids = [str(uuid4()) for _ in range(MAX_BULK_IDS + 1)]

    response = _BulkView().bulk_action(
        _request({"ids": ids}),
        queryset_fn=LoginHistory.objects.all,
        action_fn=lambda obj: None,
        update_fields=["was_successful"],
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "too_many_ids"


def test_bulk_action_accepts_the_cap_exactly():
    ids = [str(uuid4()) for _ in range(MAX_BULK_IDS)]

    response = _BulkView().bulk_action(
        _request({"ids": ids}),
        queryset_fn=LoginHistory.objects.all,
        action_fn=lambda obj: None,
        update_fields=["was_successful"],
    )

    assert response.status_code == 200
