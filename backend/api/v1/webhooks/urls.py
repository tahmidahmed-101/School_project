from __future__ import annotations

from django.urls import URLPattern, URLResolver, include, path

app_name = "webhooks"

urlpatterns: list[URLResolver | URLPattern] = [
    path("couriers/", include("api.v1.webhooks.couriers.urls")),
]
