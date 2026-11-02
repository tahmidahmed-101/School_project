from django.urls import path

from .views import PublicTrackOrderView

app_name = "public_tracking"

urlpatterns = [
    path("orders/track/", PublicTrackOrderView.as_view(), name="track-order"),
]
