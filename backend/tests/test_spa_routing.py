"""The SPA catch-all must serve client routes without swallowing the API.

The frontend uses real URLs, so /orders has to survive a refresh — but a
catch-all wide enough to do that could just as easily answer an unknown
/api/... path with a page of HTML, which a fetch() would then fail to parse
and report as a confusing client-side error instead of a 404.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.django_db


CLIENT_ROUTES = ["/orders", "/catalog", "/inventory", "/audit-log", "/settings"]


@pytest.mark.parametrize("route", CLIENT_ROUTES)
def test_client_routes_are_served_rather_than_404ing(client, route):
    """Without a build on disk the view redirects to the API docs; either way
    the point is that the URL resolves instead of falling through to a 404."""
    response = client.get(route)
    assert response.status_code in {200, 302}


def test_unknown_api_paths_still_return_404(client):
    response = client.get("/api/v1/this-endpoint-does-not-exist/")
    assert response.status_code == 404


def test_unknown_api_v1_admin_paths_still_return_404(client):
    response = client.get("/api/v1/admin/nope/")
    assert response.status_code == 404


def test_a_missing_asset_404s_instead_of_returning_html(client):
    """A stale or missing bundle must fail as a 404. Answering with index.html
    makes the browser reject it on MIME grounds and report an opaque
    module-load error instead of pointing at the real problem."""
    response = client.get("/assets/index-doesnotexist.js")
    assert response.status_code == 404


def test_the_catch_all_does_not_shadow_health(client):
    response = client.get("/health/")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_the_catch_all_does_not_shadow_django_admin(client):
    # Unauthenticated Django admin redirects to its own login page, which is
    # proof the admin URLconf handled it rather than the SPA fallback.
    response = client.get("/admin/")
    assert response.status_code == 302
    assert "/admin/login/" in response["Location"]
