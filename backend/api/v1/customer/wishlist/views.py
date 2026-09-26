from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.selectors.products import get_product_by_id
from apps.catalog.selectors.wishlist import get_wishlist_item, wishlist_for_customer
from apps.catalog.services.wishlist import add_to_wishlist, remove_from_wishlist
from apps.common.exceptions import DomainError
from apps.common.generics import list_response
from apps.common.permissions import IsCustomer
from apps.common.responses import error_from_exception, not_found

from .serializers import AddWishlistItemSerializer, WishlistItemSerializer


@extend_schema(tags=["Wishlist"])
class WishlistListCreateView(APIView):
    serializer_class = WishlistItemSerializer
    permission_classes: ClassVar[list] = [IsCustomer]

    def get(self, request) -> Response:
        return list_response(
            request, wishlist_for_customer(request.user), WishlistItemSerializer, view=self
        )

    def post(self, request) -> Response:
        serializer = AddWishlistItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = get_product_by_id(serializer.validated_data["product_id"])
        if product is None:
            return not_found("product_not_found", "Product not found.")
        try:
            item = add_to_wishlist(customer=request.user, product=product)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": WishlistItemSerializer(item).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Wishlist"])
class WishlistItemDetailView(APIView):
    permission_classes: ClassVar[list] = [IsCustomer]

    def delete(self, request, product_id) -> Response:
        item = get_wishlist_item(request.user, product_id)
        if item is None:
            return not_found("wishlist_item_not_found", "Wishlist item not found.")
        remove_from_wishlist(item=item)
        return Response(status=status.HTTP_204_NO_CONTENT)
