from __future__ import annotations

from django.urls import path

from .views import NewsletterSubscribeView, NewsletterUnsubscribeView

app_name = "public_marketing"

urlpatterns = [
    path("subscribe/", NewsletterSubscribeView.as_view(), name="newsletter-subscribe"),
    path("unsubscribe/", NewsletterUnsubscribeView.as_view(), name="newsletter-unsubscribe"),
]
