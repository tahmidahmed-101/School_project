from __future__ import annotations

from django.urls import include, path

app_name = "public"

urlpatterns = [
    path("catalog/", include("api.v1.public.catalog.urls")),
    path("marketing/", include("api.v1.public.marketing.urls")),
    path("checkout/", include("api.v1.public.checkout.urls")),
    path("tracking/", include("api.v1.public.tracking.urls")),
    path("", include("api.v1.public.business.urls")),
]
