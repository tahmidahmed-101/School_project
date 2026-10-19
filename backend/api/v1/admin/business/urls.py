from django.urls import path

from .views import (
    AdminBusinessProfileView,
    AdminHeroSlideDetailView,
    AdminHeroSlideListView,
    AdminIntegrationStatusView,
    AdminModuleDetailView,
    AdminModuleListView,
    AdminPaymentMethodDetailView,
    AdminPaymentMethodListView,
    AdminPromoLineDetailView,
    AdminPromoLineListView,
    AdminPromotionPopupDetailView,
    AdminPromotionPopupListView,
    AdminStorePolicyDetailView,
    AdminStorePolicyListView,
    AdminStorePolicyRevisionListView,
)

urlpatterns = [
    path("business-profile/", AdminBusinessProfileView.as_view(), name="business-profile"),
    path("integrations/", AdminIntegrationStatusView.as_view(), name="integration-status"),
    path("modules/", AdminModuleListView.as_view(), name="module-list"),
    path("payment-methods/", AdminPaymentMethodListView.as_view(), name="payment-method-list"),
    path(
        "payment-methods/<str:key>/",
        AdminPaymentMethodDetailView.as_view(),
        name="payment-method-detail",
    ),
    path("modules/<str:key>/", AdminModuleDetailView.as_view(), name="module-detail"),
    path("policies/", AdminStorePolicyListView.as_view(), name="store-policy-list"),
    path(
        "policies/<str:kind>/",
        AdminStorePolicyDetailView.as_view(),
        name="store-policy-detail",
    ),
    path(
        "policies/<str:kind>/revisions/",
        AdminStorePolicyRevisionListView.as_view(),
        name="store-policy-revision-list",
    ),
    path("hero-slides/", AdminHeroSlideListView.as_view(), name="hero-slide-list"),
    path(
        "hero-slides/<uuid:pk>/",
        AdminHeroSlideDetailView.as_view(),
        name="hero-slide-detail",
    ),
    path("promo-lines/", AdminPromoLineListView.as_view(), name="promo-line-list"),
    path(
        "promo-lines/<uuid:pk>/",
        AdminPromoLineDetailView.as_view(),
        name="promo-line-detail",
    ),
    path("promotion-popups/", AdminPromotionPopupListView.as_view(), name="promotion-popup-list"),
    path(
        "promotion-popups/<uuid:pk>/",
        AdminPromotionPopupDetailView.as_view(),
        name="promotion-popup-detail",
    ),
]
