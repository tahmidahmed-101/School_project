from __future__ import annotations

import threading
from typing import Any

from django.conf import settings

_local = threading.local()


def get_current_request_meta() -> dict[str, str]:
    """Read the current request's IP/user-agent, set by RequestMetadataMiddleware.

    Returns an empty dict outside of a request (e.g. management commands,
    unit tests calling services directly) so services stay callable without
    a request in scope.
    """
    return getattr(_local, "meta", {})


def _client_ip(request: Any) -> str:
    """The address the trusted proxy reported, not the one the caller claimed.

    Anything a client sends in X-Forwarded-For is appended to by nginx, so the
    leftmost entry is attacker-controlled; only the rightmost hops were written
    by infrastructure we trust.
    """
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        hops = [hop.strip() for hop in forwarded.split(",") if hop.strip()]
        index = min(getattr(settings, "TRUSTED_PROXY_COUNT", 1), len(hops))
        if hops:
            return hops[-index]
    return request.META.get("REMOTE_ADDR", "") or ""


class RequestMetadataMiddleware:
    """Stashes the current request's IP/user-agent in a thread-local so
    services deep in the call stack (audit logging, login history) can
    record them without threading request objects through every function.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        _local.meta = {
            "ip_address": _client_ip(request),
            "user_agent": request.META.get("HTTP_USER_AGENT", "")[:500],
        }
        try:
            response = self.get_response(request)
        finally:
            _local.meta = {}
        return response
