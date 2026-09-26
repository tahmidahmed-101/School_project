from __future__ import annotations

from apps.audit.middleware import RequestMetadataMiddleware, get_current_request_meta


class _Request:
    def __init__(self, remote_addr: str, user_agent: str) -> None:
        self.META = {"REMOTE_ADDR": remote_addr, "HTTP_USER_AGENT": user_agent}


def test_middleware_populates_and_clears_thread_local_meta():
    captured = {}

    def get_response(request):
        captured.update(get_current_request_meta())
        return "response"

    middleware = RequestMetadataMiddleware(get_response)
    request = _Request("198.51.100.7", "pytest-ua")

    result = middleware(request)

    assert result == "response"
    assert captured == {"ip_address": "198.51.100.7", "user_agent": "pytest-ua"}
    assert get_current_request_meta() == {}


def test_middleware_reads_x_forwarded_for():
    def get_response(request):
        return get_current_request_meta()["ip_address"]

    middleware = RequestMetadataMiddleware(get_response)
    request = _Request("10.0.0.1", "pytest-ua")
    request.META["HTTP_X_FORWARDED_FOR"] = "203.0.113.9"

    assert middleware(request) == "203.0.113.9"


def test_middleware_ignores_a_client_supplied_forwarded_hop():
    """A caller can put anything in X-Forwarded-For and nginx appends to it, so
    only the rightmost hop — the one our proxy wrote — may be trusted."""

    def get_response(request):
        return get_current_request_meta()["ip_address"]

    middleware = RequestMetadataMiddleware(get_response)
    request = _Request("10.0.0.1", "pytest-ua")
    request.META["HTTP_X_FORWARDED_FOR"] = "1.2.3.4, 203.0.113.9"

    assert middleware(request) == "203.0.113.9"
