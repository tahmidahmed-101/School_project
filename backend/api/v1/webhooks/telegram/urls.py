from __future__ import annotations

from django.urls import path

from .views import TelegramWebhookView

app_name = "webhooks_telegram"

urlpatterns = [
    path("", TelegramWebhookView.as_view(), name="telegram-webhook"),
]
