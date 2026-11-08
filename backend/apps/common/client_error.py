"""Browser errors as one ERROR log line, which `pmo logs` groups. Wired at api/client-error/.

Always 204: a telemetry endpoint that fails visibly is a second error on the same page.
"""

import json
import logging
import re
import time

from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

logger = logging.getLogger("client_error")

MAX_BODY = 6000
MAX_STACK_LINES = 6
LIMIT_PER_MINUTE = 30
GLOBAL_PER_MINUTE = 600
# The admin SPA posts from admin.schoolproject.com, which the browser labels same-site, not same-origin.
_TRUSTED_SITES = {"same-origin", "same-site"}
_hits: dict[str, list[float]] = {}
_global: list[float] = []


def _allowed(ip: str, now: float) -> bool:
    _global[:] = [t for t in _global if now - t < 60]
    if len(_global) >= GLOBAL_PER_MINUTE:
        return False
    _global.append(now)
    if len(_hits) > 5000:
        _hits.clear()
    window = [t for t in _hits.get(ip, []) if now - t < 60]
    if len(window) >= LIMIT_PER_MINUTE:
        _hits[ip] = window
        return False
    window.append(now)
    _hits[ip] = window
    return True


def _text(value, limit):
    return value[:limit] if isinstance(value, str) else None


def _no_query(value):
    if value is None:
        return None
    return re.sub(r"(https?://[^\s?)]*)\?[^\s)]*", r"\1", value)


@csrf_exempt
@require_POST
def client_error(request):
    try:
        ip = (
            request.META.get("HTTP_X_FORWARDED_FOR", request.META.get("REMOTE_ADDR", "unknown"))
            .split(",")[0]
            .strip()[:64]
        )
        site = request.META.get("HTTP_SEC_FETCH_SITE")
        length = int(request.META.get("CONTENT_LENGTH") or 0)
        if (
            (not site or site in _TRUSTED_SITES)
            and 0 < length <= MAX_BODY
            and _allowed(ip, time.time())
        ):
            body = json.loads(request.body)
            stack = _text(body.get("stack"), 2000)
            if stack:
                stack = " | ".join(_no_query(line) for line in stack.split("\n")[:MAX_STACK_LINES])
            path = _text(body.get("path"), 120)
            logger.error(
                "[client-error] %s",
                json.dumps(
                    {
                        "message": _no_query(_text(body.get("message"), 300)),
                        "path": path.split("?")[0] if path else None,
                        "where": _no_query(_text(body.get("where"), 40)),
                        "digest": _text(body.get("digest"), 80),
                        "stack": stack,
                    }
                ),
            )
    except Exception:  # noqa: S110
        # Telemetry answers 204 whatever the body holds, RecursionError included.
        pass
    return HttpResponse(status=204)
