from __future__ import annotations

from django.urls import include, path

app_name = "customer"

urlpatterns = [
    path("auth/", include("api.v1.customer.auth.urls")),
    path("profile/", include("api.v1.customer.profile.urls")),
    path("addresses/", include("api.v1.customer.addresses.urls")),
    path("sessions/", include("api.v1.customer.sessions.urls")),
    path("orders/", include("api.v1.customer.orders.urls")),
    path("wishlist/", include("api.v1.customer.wishlist.urls")),
    path("reviews/", include("api.v1.customer.reviews.urls")),
]
