from __future__ import annotations

from django.urls import path

from .views import CustomerReviewCreateView, CustomerReviewDetailView

app_name = "customer_reviews"

urlpatterns = [
    path(
        "products/<uuid:product_id>/",
        CustomerReviewCreateView.as_view(),
        name="review-create",
    ),
    path("<uuid:review_id>/", CustomerReviewDetailView.as_view(), name="review-detail"),
]
