from __future__ import annotations

from django.urls import include, path

urlpatterns = [
    path("public/", include("api.v1.public.urls")),
    path("customer/", include("api.v1.customer.urls")),
    path("admin/", include("api.v1.admin.urls")),
    path("webhooks/", include("api.v1.webhooks.urls")),
]
