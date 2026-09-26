from __future__ import annotations

from django.urls import path

from .views import (
    AdminCarrierDetailView,
    AdminCarrierListCreateView,
    AdminCarrierRestoreView,
    AdminShippingRateDetailView,
    AdminShippingRateListView,
    AdminShippingZoneDetailView,
    AdminShippingZoneListCreateView,
    AdminShippingZoneRateCreateView,
    AdminShippingZoneRestoreView,
)

app_name = "admin_logistics"

urlpatterns = [
    path("carriers/", AdminCarrierListCreateView.as_view(), name="carrier-list"),
    path("carriers/<uuid:carrier_id>/", AdminCarrierDetailView.as_view(), name="carrier-detail"),
    path(
        "carriers/<uuid:carrier_id>/restore/",
        AdminCarrierRestoreView.as_view(),
        name="carrier-restore",
    ),
    path("zones/", AdminShippingZoneListCreateView.as_view(), name="zone-list"),
    path("zones/<uuid:zone_id>/", AdminShippingZoneDetailView.as_view(), name="zone-detail"),
    path(
        "zones/<uuid:zone_id>/restore/",
        AdminShippingZoneRestoreView.as_view(),
        name="zone-restore",
    ),
    path(
        "zones/<uuid:zone_id>/rates/",
        AdminShippingZoneRateCreateView.as_view(),
        name="zone-rate-create",
    ),
    path("rates/", AdminShippingRateListView.as_view(), name="rate-list"),
    path(
        "rates/<uuid:rate_id>/",
        AdminShippingRateDetailView.as_view(),
        name="rate-detail",
    ),
]
