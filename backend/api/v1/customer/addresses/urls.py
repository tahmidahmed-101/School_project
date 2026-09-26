from __future__ import annotations

from django.urls import path

from .views import AddressDetailView, AddressListCreateView, SetDefaultAddressView

app_name = "customer_addresses"

urlpatterns = [
    path("", AddressListCreateView.as_view(), name="address-list"),
    path("<uuid:address_id>/", AddressDetailView.as_view(), name="address-detail"),
    path("<uuid:address_id>/set-default/", SetDefaultAddressView.as_view(), name="set-default"),
]
