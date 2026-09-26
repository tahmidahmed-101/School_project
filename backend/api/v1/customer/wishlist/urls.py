from __future__ import annotations

from django.urls import path

from .views import WishlistItemDetailView, WishlistListCreateView

app_name = "customer_wishlist"

urlpatterns = [
    path("", WishlistListCreateView.as_view(), name="wishlist-list"),
    path("<uuid:product_id>/", WishlistItemDetailView.as_view(), name="wishlist-detail"),
]
