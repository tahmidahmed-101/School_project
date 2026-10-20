from __future__ import annotations

from django.urls import path

from .campaign_views import (
    AdminCampaignActionView,
    AdminCampaignAudienceView,
    AdminCampaignDeliveryListView,
    AdminCampaignDetailView,
    AdminCampaignListView,
    AdminCampaignTestView,
    AdminSuppressionDetailView,
    AdminSuppressionListView,
)
from .views import (
    AdminNewsletterSubscriberDetailView,
    AdminNewsletterSubscriberExportView,
    AdminNewsletterSubscriberListView,
)

app_name = "admin_marketing"

urlpatterns = [
    path("subscribers/", AdminNewsletterSubscriberListView.as_view(), name="subscriber-list"),
    path(
        "subscribers/export/",
        AdminNewsletterSubscriberExportView.as_view(),
        name="subscriber-export",
    ),
    path(
        "subscribers/<uuid:subscriber_id>/",
        AdminNewsletterSubscriberDetailView.as_view(),
        name="subscriber-detail",
    ),
    path("campaigns/", AdminCampaignListView.as_view(), name="campaign-list"),
    path("campaigns/audience/", AdminCampaignAudienceView.as_view(), name="campaign-audience"),
    path(
        "campaigns/<uuid:campaign_id>/", AdminCampaignDetailView.as_view(), name="campaign-detail"
    ),
    *[
        path(
            f"campaigns/<uuid:campaign_id>/{action}/",
            AdminCampaignActionView.as_view(action=action),
            name=f"campaign-{action}",
        )
        for action in ("schedule", "unschedule", "cancel")
    ],
    path(
        "campaigns/<uuid:campaign_id>/test/", AdminCampaignTestView.as_view(), name="campaign-test"
    ),
    path(
        "campaigns/<uuid:campaign_id>/deliveries/",
        AdminCampaignDeliveryListView.as_view(),
        name="campaign-delivery-list",
    ),
    path("suppressions/", AdminSuppressionListView.as_view(), name="suppression-list"),
    path(
        "suppressions/<uuid:suppression_id>/",
        AdminSuppressionDetailView.as_view(),
        name="suppression-detail",
    ),
]
