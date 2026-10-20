from __future__ import annotations

from django.urls import path

from .views import (
    NewsletterSubscribeView,
    NewsletterUnsubscribeView,
    newsletter_unsubscribe_page,
)

app_name = "public_marketing"

urlpatterns = [
    path("subscribe/", NewsletterSubscribeView.as_view(), name="newsletter-subscribe"),
    path("unsubscribe/", NewsletterUnsubscribeView.as_view(), name="newsletter-unsubscribe"),
    path(
        "unsubscribe/<str:token>/",
        newsletter_unsubscribe_page,
        name="newsletter-unsubscribe-page",
    ),
]
