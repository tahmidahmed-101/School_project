from __future__ import annotations

from django.urls import path

from .views import RevokeOtherSessionsView, SessionListView, SessionRevokeView

app_name = "customer_sessions"

urlpatterns = [
    path("", SessionListView.as_view(), name="session-list"),
    path("<int:session_id>/revoke/", SessionRevokeView.as_view(), name="session-revoke"),
    path("revoke-others/", RevokeOtherSessionsView.as_view(), name="revoke-others"),
]
