from __future__ import annotations

from django.urls import path

from .brand_views import (
    AdminBrandBulkStatusView,
    AdminBrandDetailView,
    AdminBrandListCreateView,
    AdminBrandRestoreView,
)
from .bundle_views import AdminBundleDetailView, AdminBundleListCreateView, AdminBundleRestoreView
from .category_views import (
    AdminCategoryDetailView,
    AdminCategoryListCreateView,
    AdminCategoryRestoreView,
)
from .image_views import AdminProductImageDetailView, AdminProductImageListCreateView
from .product_views import (
    AdminProductBulkStatusView,
    AdminProductDetailView,
    AdminProductListCreateView,
    AdminProductRestoreView,
)
from .review_views import AdminProductReviewDetailView, AdminProductReviewListView
from .variant_views import (
    AdminProductVariantDetailView,
    AdminProductVariantGenerateView,
    AdminProductVariantGlobalListView,
    AdminProductVariantListCreateView,
    AdminVariantExportView,
    AdminVariantImportView,
)

app_name = "admin_catalog"

urlpatterns = [
    path("brands/", AdminBrandListCreateView.as_view(), name="brand-list"),
    path(
        "brands/<uuid:brand_id>/",
        AdminBrandDetailView.as_view(),
        name="brand-detail",
    ),
    path(
        "brands/<uuid:brand_id>/restore/",
        AdminBrandRestoreView.as_view(),
        name="brand-restore",
    ),
    path(
        "brands/bulk-status/",
        AdminBrandBulkStatusView.as_view(),
        name="brand-bulk-status",
    ),
    path("categories/", AdminCategoryListCreateView.as_view(), name="category-list"),
    path(
        "categories/<uuid:category_id>/",
        AdminCategoryDetailView.as_view(),
        name="category-detail",
    ),
    path(
        "categories/<uuid:category_id>/restore/",
        AdminCategoryRestoreView.as_view(),
        name="category-restore",
    ),
    path("products/", AdminProductListCreateView.as_view(), name="product-list"),
    path(
        "products/bulk-status/",
        AdminProductBulkStatusView.as_view(),
        name="product-bulk-status",
    ),
    path("products/<uuid:product_id>/", AdminProductDetailView.as_view(), name="product-detail"),
    path(
        "products/<uuid:product_id>/restore/",
        AdminProductRestoreView.as_view(),
        name="product-restore",
    ),
    path(
        "products/<uuid:product_id>/variants/",
        AdminProductVariantListCreateView.as_view(),
        name="product-variant-list",
    ),
    path(
        "products/<uuid:product_id>/variants/generate/",
        AdminProductVariantGenerateView.as_view(),
        name="product-variant-generate",
    ),
    path(
        "products/<uuid:product_id>/images/",
        AdminProductImageListCreateView.as_view(),
        name="product-image-list",
    ),
    path("images/<uuid:image_id>/", AdminProductImageDetailView.as_view(), name="image-detail"),
    path("reviews/", AdminProductReviewListView.as_view(), name="review-list"),
    path(
        "reviews/<uuid:review_id>/",
        AdminProductReviewDetailView.as_view(),
        name="review-detail",
    ),
    path("variants/", AdminProductVariantGlobalListView.as_view(), name="variant-global-list"),
    path("variants/export/", AdminVariantExportView.as_view(), name="variant-export"),
    path("variants/import/", AdminVariantImportView.as_view(), name="variant-import"),
    path(
        "variants/<uuid:variant_id>/",
        AdminProductVariantDetailView.as_view(),
        name="variant-detail",
    ),
    path("bundles/", AdminBundleListCreateView.as_view(), name="bundle-list"),
    path(
        "bundles/<uuid:variant_id>/",
        AdminBundleDetailView.as_view(),
        name="bundle-detail",
    ),
    path(
        "bundles/<uuid:variant_id>/restore/",
        AdminBundleRestoreView.as_view(),
        name="bundle-restore",
    ),
]
