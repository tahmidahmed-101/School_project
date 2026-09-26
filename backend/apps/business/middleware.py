from __future__ import annotations

from django.http import JsonResponse

from apps.business.constants import ModuleKey

# Admin API path segment -> module key. Every disableable module owns a unique
# first segment under /api/v1/admin/, which is what makes one map enough.
ADMIN_SEGMENT_MODULES: dict[str, str] = {
    "procurement": ModuleKey.PROCUREMENT,
    "logistics": ModuleKey.LOGISTICS,
    "reporting": ModuleKey.REPORTING,
}

ADMIN_PREFIX = "/api/v1/admin/"


def _module_for_path(path: str) -> str | None:
    if not path.startswith(ADMIN_PREFIX):
        return None
    segment = path[len(ADMIN_PREFIX) :].split("/", 1)[0]
    return ADMIN_SEGMENT_MODULES.get(segment)


class ModuleEnabledMiddleware:
    """Rejects admin traffic aimed at a switched-off module.

    Hiding the nav entry is presentation; this is the enforcement. It sits in
    middleware rather than on each view so a route added later is covered by
    default instead of by remembering to decorate it.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        key = _module_for_path(request.path)
        if key is not None:
            from apps.business.selectors.modules import is_module_enabled

            if not is_module_enabled(key):
                return JsonResponse(
                    {
                        "error": {
                            "code": "module_disabled",
                            "message": "This module is switched off.",
                            "fields": {"module": key},
                        }
                    },
                    status=403,
                )
        return self.get_response(request)
