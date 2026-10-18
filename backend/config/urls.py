from __future__ import annotations

import mimetypes
from pathlib import Path

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import HttpResponse
from django.shortcuts import redirect
from django.urls import include, path, re_path
from django.views.static import serve
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from api.health import health_check

from . import admin as admin_branding  # noqa: F401  (applies admin.site branding on import)


def _spa_index_html() -> str | None:
    """The built index.html, read once per process."""
    root = getattr(settings, "WHITENOISE_ROOT", None)
    if not root:
        dist_path = settings.BASE_DIR.parent / "frontend" / "dist"
        if (dist_path / "index.html").is_file():
            root = dist_path
        else:
            return None
    index_path = Path(root) / "index.html"
    return index_path.read_text(encoding="utf-8") if index_path.is_file() else None


def index(request):
    html = _spa_index_html()
    if html is None:
        return redirect("swagger-ui")
    response = HttpResponse(html, content_type="text/html")
    response["Cache-Control"] = "no-cache, must-revalidate"
    return response


urlpatterns = [
    path("", index),
    path("health/", health_check, name="health-check"),
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/v1/", include("api.v1.urls")),
]

_frontend_assets = settings.BASE_DIR.parent / "frontend" / "dist" / "assets"
if _frontend_assets.is_dir():
    urlpatterns += [re_path(r"^assets/(?P<path>.*)$", serve, {"document_root": _frontend_assets})]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)


# The slim image has no /etc/mime.types, so Python would serve these as application/octet-stream and
# crawlers refuse them as og:image.
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/avif", ".avif")


def media_serve(request, path):
    """Uploads are stored under a random name and never rewritten, so they can be
    cached forever — which keeps repeat fetches off the small sync worker pool
    that `serve` shares with the API."""
    response = serve(request, path, document_root=settings.MEDIA_ROOT)
    response["Cache-Control"] = "public, max-age=31536000, immutable"
    return response


# Served by Django in every environment, not just DEBUG: WhiteNoise only knows about
# the immutable build output, and admin-uploaded images land here at runtime.
urlpatterns += [re_path(r"^media/(?P<path>.*)$", media_serve, name="media")]

# The SPA uses real URLs (/orders, /catalog/...), so any of them can be
# entered directly, bookmarked or reloaded — and the server has to answer with
# index.html and let the client router take it from there. Without this,
# every route but "/" 404s on refresh.
#
# Declared last and excluding the prefixes above, so it can never shadow the
# API: an unknown /api/... path still returns a real 404 rather than a page of
# HTML that a fetch() would fail to parse.
# `assets/` is excluded alongside the API prefixes: WhiteNoise serves the
# built bundles from there, and anything it doesn't have should 404. Falling
# through to index.html instead answers a missing chunk with HTML, which the
# browser rejects on MIME grounds and reports as an opaque module-load error
# rather than the plain 404 that points straight at a stale build.
urlpatterns += [
    re_path(r"^(?!api/|admin/|health/|static/|assets/|media/).*$", index),
]
