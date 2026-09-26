from django.urls import path

from .views import GuestCheckoutView

app_name = "public_checkout"

urlpatterns = [
    path("", GuestCheckoutView.as_view(), name="guest-checkout"),
]