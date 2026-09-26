from __future__ import annotations


class PutToPatchMiddleware:
    """Translates incoming HTTP PUT requests to PATCH so that endpoints
    implemented with DRF's patch() method can seamlessly handle PUT requests."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method == "PUT":
            request.method = "PATCH"
        return self.get_response(request)
