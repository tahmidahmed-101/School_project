from __future__ import annotations

from django.urls import path

from .views import GuestCartLineDetailView, GuestCartLineListCreateView, GuestCartView

app_name = "public_cart"

urlpatterns = [
    path("", GuestCartView.as_view(), name="guest-cart"),
    path("lines/", GuestCartLineListCreateView.as_view(), name="guest-cart-lines"),
    path("lines/<uuid:line_id>/", GuestCartLineDetailView.as_view(), name="guest-cart-line"),
]
