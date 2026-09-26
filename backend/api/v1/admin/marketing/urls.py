from __future__ import annotations

from django.urls import path

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
]
