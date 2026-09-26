from __future__ import annotations

from django.urls import path

from .views import AdminMediaUploadView

app_name = "admin_media"

urlpatterns = [
    path("uploads/", AdminMediaUploadView.as_view(), name="upload"),
]
