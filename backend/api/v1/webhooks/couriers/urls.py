from __future__ import annotations

from django.urls import path

from .views import CourierWebhookView

app_name = "webhooks_couriers"

urlpatterns = [
    path("<uuid:carrier_id>/", CourierWebhookView.as_view(), name="courier-webhook"),
]
