from __future__ import annotations

import json
import logging

import pytest
from django.test import Client

from apps.common import client_error as module

URL = "/api/client-error/"
BODY = json.dumps({"message": "boom", "path": "/checkout?x=1", "where": "checkout-submit"})


@pytest.fixture(autouse=True)
def _reset_limits():
    module._hits.clear()
    module._global.clear()


def _post(body=BODY, **headers):
    return Client().post(URL, data=body, content_type="application/json", **headers)


def test_logs_one_client_error_line_and_answers_204(caplog):
    with caplog.at_level(logging.ERROR):
        response = _post()

    assert response.status_code == 204
    lines = [r.getMessage() for r in caplog.records if "[client-error]" in r.getMessage()]
    assert len(lines) == 1
    assert '"path": "/checkout"' in lines[0]
    assert '"where": "checkout-submit"' in lines[0]


def test_same_site_admin_post_is_logged(caplog):
    with caplog.at_level(logging.ERROR):
        response = _post(HTTP_SEC_FETCH_SITE="same-site")

    assert response.status_code == 204
    assert "[client-error]" in caplog.text


def test_cross_site_post_is_dropped_with_204(caplog):
    with caplog.at_level(logging.ERROR):
        response = _post(HTTP_SEC_FETCH_SITE="cross-site")

    assert response.status_code == 204
    assert "[client-error]" not in caplog.text


def test_malformed_body_still_answers_204(caplog):
    with caplog.at_level(logging.ERROR):
        response = _post(body="not json")

    assert response.status_code == 204
    assert "[client-error]" not in caplog.text


def test_get_is_not_allowed():
    assert Client().get(URL).status_code == 405
