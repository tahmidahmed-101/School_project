from __future__ import annotations

from django.urls import URLPattern, URLResolver

app_name = "webhooks"

urlpatterns: list[URLResolver | URLPattern] = [
    # Add external service webhook modules here, e.g.:
    # path("stripe/", include("api.v1.webhooks.stripe.urls"))  # noqa: ERA001
]
