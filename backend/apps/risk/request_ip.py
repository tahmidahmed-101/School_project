"""The client address to trust for a block check, not for a log line.

DRF's own throttling picks the address `settings.NUM_PROXIES` hops from the
*right* of X-Forwarded-For, which nginx/the load balancer append to rather
than let a client overwrite. Reused here since a block check has the same
spoofing concern a rate limit does.
"""

from __future__ import annotations

from rest_framework.throttling import BaseThrottle


def client_ip(request) -> str:
    return BaseThrottle().get_ident(request) or ""
