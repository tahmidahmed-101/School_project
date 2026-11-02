from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import ProductOptionValue
from apps.catalog.selectors.products import (
    get_product_by_id,
    get_product_image_by_id,
    get_variant_by_id,
)
from apps.catalog.services.products import (
    create_product_image,
    delete_product_image,
    update_product_image,
)
from apps.common.exception_handler import status_for_code
from apps.common.exceptions import DomainError
from apps.common.generics import (
    list_response,
)
from apps.common.responses import error_from_exception, not_found

from .permissions import (
    CatalogPermissionMixin,
)
from .serializers import (
    ProductImageCreateSerializer,
    ProductImageSerializer,
    ProductImageUpdateSerializer,
)


def _swap_option_value(data: dict) -> None:
    """`option_value_id` in the request becomes the `option_value` the service takes."""
    if "option_value_id" not in data:
        return
    value_id = data.pop("option_value_id")
    value = None
    if value_id is not None:
        value = ProductOptionValue.objects.select_related("option").filter(id=value_id).first()
        if value is None:
            raise DomainError("Option value not found.", code="invalid_target")
    data["option_value"] = value


class AdminProductImageListCreateView(CatalogPermissionMixin, APIView):
    serializer_class = ProductImageSerializer

    def get(self, request, product_id) -> Response:
        product = get_product_by_id(product_id)
        if product is None:
            return not_found("product_not_found", "Product not found.")
        return list_response(request, product.images.all(), ProductImageSerializer, view=self)

    def post(self, request, product_id) -> Response:
        product = get_product_by_id(product_id)
        if product is None:
            return not_found("product_not_found", "Product not found.")
        serializer = ProductImageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        variant = None
        variant_id = data.pop("variant_id", None)
        if variant_id:
            variant = get_variant_by_id(variant_id)
            if variant is None:
                return error_from_exception(
                    DomainError("Variant not found.", code="variant_not_found")
                )
        try:
            _swap_option_value(data)
            image = create_product_image(
                product=None if variant else product, variant=variant, **data
            )
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        except DjangoValidationError as exc:
            # `url` is a 500-char column; an over-long value must read as a bad
            # request, not as the 500 an uncaught model ValidationError produces.
            return error_from_exception(exc)
        return Response(
            {"data": ProductImageSerializer(image).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Catalog"])
class AdminProductImageDetailView(CatalogPermissionMixin, APIView):
    serializer_class = ProductImageSerializer

    def get(self, request, image_id) -> Response:
        image = get_product_image_by_id(image_id)
        if image is None:
            return not_found("product_image_not_found", "Product image not found.")
        return Response({"data": ProductImageSerializer(image).data, "message": "Success"})

    def patch(self, request, image_id) -> Response:
        image = get_product_image_by_id(image_id)
        if image is None:
            return not_found("product_image_not_found", "Product image not found.")
        serializer = ProductImageUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        try:
            _swap_option_value(data)
            image = update_product_image(image=image, data=data)
        except DomainError as exc:
            return error_from_exception(exc, status_for_code(exc.code))
        except DjangoValidationError as exc:
            return error_from_exception(exc)
        return Response({"data": ProductImageSerializer(image).data, "message": "Success"})

    def delete(self, request, image_id) -> Response:
        image = get_product_image_by_id(image_id)
        if image is None:
            return not_found("product_image_not_found", "Product image not found.")
        delete_product_image(image=image)
        return Response({"data": {}, "message": "Success"})
