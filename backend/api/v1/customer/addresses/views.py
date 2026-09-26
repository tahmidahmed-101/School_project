from __future__ import annotations

from typing import ClassVar

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.selectors.addresses import addresses_for_user, get_address_for_user
from apps.accounts.services.addresses import (
    create_address,
    delete_address,
    set_default_address,
    update_address,
)
from apps.common.responses import not_found

from .serializers import AddressSerializer, AddressUpdateSerializer


def _address_data(address) -> dict:
    return AddressSerializer(address).data


@extend_schema(tags=["Addresses"])
class AddressListCreateView(APIView):
    permission_classes: ClassVar[list] = [IsAuthenticated]

    @extend_schema(
        operation_id="v1_customer_addresses_list",
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Address list response",
                value={
                    "data": [
                        {
                            "id": "22222222-2222-2222-2222-222222222222",
                            "full_name": "Jane Doe",
                            "phone": "+15550000000",
                            "line1": "123 Market Street",
                            "line2": "Suite 10",
                            "city": "San Francisco",
                            "state": "CA",
                            "postal_code": "94105",
                            "country": "US",
                            "is_default": True,
                        }
                    ],
                    "message": "Success",
                },
                response_only=True,
            ),
        ],
    )
    def get(self, request) -> Response:
        serializer = AddressSerializer(addresses_for_user(request.user), many=True)
        return Response({"data": serializer.data, "message": "Success"})

    @extend_schema(
        request=AddressSerializer,
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Address create request",
                value={
                    "full_name": "Jane Doe",
                    "phone": "+15550000000",
                    "line1": "123 Market Street",
                    "line2": "Suite 10",
                    "city": "San Francisco",
                    "state": "CA",
                    "postal_code": "94105",
                    "country": "US",
                    "is_default": True,
                },
                request_only=True,
            ),
            OpenApiExample(
                "Address create response",
                value={
                    "data": {
                        "id": "22222222-2222-2222-2222-222222222222",
                        "full_name": "Jane Doe",
                        "phone": "+15550000000",
                        "line1": "123 Market Street",
                        "line2": "Suite 10",
                        "city": "San Francisco",
                        "state": "CA",
                        "postal_code": "94105",
                        "country": "US",
                        "is_default": True,
                    },
                    "message": "Success",
                },
                response_only=True,
            ),
        ],
    )
    def post(self, request) -> Response:
        serializer = AddressSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        address = create_address(user=request.user, data=serializer.validated_data)
        return Response(
            {"data": _address_data(address), "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Addresses"])
class AddressDetailView(APIView):
    permission_classes: ClassVar[list] = [IsAuthenticated]

    def _get_address(self, request, address_id):
        address = get_address_for_user(request.user, address_id)
        if address is None:
            return None
        return address

    @extend_schema(
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Address detail response",
                value={
                    "data": {
                        "id": "22222222-2222-2222-2222-222222222222",
                        "full_name": "Jane Doe",
                        "phone": "+15550000000",
                        "line1": "123 Market Street",
                        "line2": "Suite 10",
                        "city": "San Francisco",
                        "state": "CA",
                        "postal_code": "94105",
                        "country": "US",
                        "is_default": True,
                    },
                    "message": "Success",
                },
                response_only=True,
            ),
        ],
    )
    def get(self, request, address_id) -> Response:
        address = self._get_address(request, address_id)
        if address is None:
            return not_found("address_not_found", "Address not found.")
        return Response({"data": _address_data(address), "message": "Success"})

    @extend_schema(
        request=AddressUpdateSerializer,
        responses=OpenApiTypes.OBJECT,
        examples=[
            OpenApiExample(
                "Address update request",
                value={"city": "Oakland", "postal_code": "94607"},
                request_only=True,
            ),
            OpenApiExample(
                "Address update response",
                value={
                    "data": {
                        "id": "22222222-2222-2222-2222-222222222222",
                        "full_name": "Jane Doe",
                        "phone": "+15550000000",
                        "line1": "123 Market Street",
                        "line2": "Suite 10",
                        "city": "Oakland",
                        "state": "CA",
                        "postal_code": "94607",
                        "country": "US",
                        "is_default": True,
                    },
                    "message": "Success",
                },
                response_only=True,
            ),
        ],
    )
    def patch(self, request, address_id) -> Response:
        address = self._get_address(request, address_id)
        if address is None:
            return not_found("address_not_found", "Address not found.")
        serializer = AddressUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        address = update_address(user=request.user, address=address, data=serializer.validated_data)
        return Response({"data": _address_data(address), "message": "Success"})

    @extend_schema(responses={204: None})
    def delete(self, request, address_id) -> Response:
        address = self._get_address(request, address_id)
        if address is None:
            return not_found("address_not_found", "Address not found.")
        delete_address(address=address)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["Addresses"])
class SetDefaultAddressView(APIView):
    permission_classes: ClassVar[list] = [IsAuthenticated]

    @extend_schema(
        request=None,
        responses=dict,
        examples=[
            OpenApiExample(
                "Set default address response",
                value={
                    "data": {
                        "id": "22222222-2222-2222-2222-222222222222",
                        "full_name": "Jane Doe",
                        "phone": "+15550000000",
                        "line1": "123 Market Street",
                        "line2": "Suite 10",
                        "city": "San Francisco",
                        "state": "CA",
                        "postal_code": "94105",
                        "country": "US",
                        "is_default": True,
                    },
                    "message": "Success",
                },
                response_only=True,
            ),
        ],
    )
    def post(self, request, address_id) -> Response:
        address = get_address_for_user(request.user, address_id)
        if address is None:
            return not_found("address_not_found", "Address not found.")
        address = set_default_address(user=request.user, address=address)
        return Response({"data": _address_data(address), "message": "Success"})
