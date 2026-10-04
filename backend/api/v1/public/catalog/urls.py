from __future__ import annotations

from django.urls import path

from .views import (
    PublicBundleDetailView,
    PublicBundleListView,
    PublicCategoryDetailView,
    PublicCategoryListView,
    PublicProductDetailView,
    PublicProductListView,
    PublicProductQuestionListView,
    PublicProductReviewListView,
    PublicRelatedProductListView,
)

app_name = "public_catalog"

urlpatterns = [
    path("categories/", PublicCategoryListView.as_view(), name="category-list"),
    path("categories/<slug:slug>/", PublicCategoryDetailView.as_view(), name="category-detail"),
    path("products/", PublicProductListView.as_view(), name="product-list"),
    path("products/<slug:slug>/", PublicProductDetailView.as_view(), name="product-detail"),
    path(
        "products/<slug:slug>/reviews/",
        PublicProductReviewListView.as_view(),
        name="product-review-list",
    ),
    path(
        "products/<slug:slug>/questions/",
        PublicProductQuestionListView.as_view(),
        name="product-question-list",
    ),
    path(
        "products/<slug:slug>/related/",
        PublicRelatedProductListView.as_view(),
        name="product-related-list",
    ),
    path("bundles/", PublicBundleListView.as_view(), name="bundle-list"),
    path("bundles/<slug:slug>/", PublicBundleDetailView.as_view(), name="bundle-detail"),
]
