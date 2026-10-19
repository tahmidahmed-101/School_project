from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.business.models import PolicyKind
from apps.business.selectors import get_business_profile
from apps.business.selectors.policies import get_published_policy, returns_enabled
from apps.business.selectors.storefront_content import (
    eligible_preorder_popup,
    eligible_promotion_popup,
    hero_slides_list,
    promo_lines_list,
)
from apps.common.params import KIND_STOCK, get_kind
from apps.common.responses import not_found
from apps.common.throttling import PublicReadRateThrottle
from apps.orders.constants import STOREFRONT_PAYMENT_METHODS
from apps.orders.selectors.payment_methods import payment_methods_list

from .serializers import (
    PublicBusinessProfileSerializer,
    PublicPaymentMethodSerializer,
    PublicReturnPolicySerializer,
    PublicStorefrontContentSerializer,
    PublicStorePolicySerializer,
)


@extend_schema(tags=["Public Business"])
class PublicBusinessProfileView(APIView):
    serializer_class = PublicBusinessProfileSerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [PublicReadRateThrottle]

    def get(self, request) -> Response:
        profile = get_business_profile()
        return Response(
            {"data": PublicBusinessProfileSerializer(profile).data, "message": "Success"}
        )


@extend_schema(tags=["Public Business"])
class PublicPaymentMethodListView(APIView):
    serializer_class = PublicPaymentMethodSerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [PublicReadRateThrottle]

    def get(self, request) -> Response:
        kind = get_kind(request.query_params) or KIND_STOCK
        offered = [
            row
            for row in payment_methods_list(kind=kind)
            if row["is_enabled"] and row["key"] in STOREFRONT_PAYMENT_METHODS
        ]
        return Response(
            {
                "data": PublicPaymentMethodSerializer(offered, many=True).data,
                "message": "Success",
            }
        )


@extend_schema(tags=["Public Business"], responses=PublicStorePolicySerializer)
class PublicStorePolicyView(APIView):
    """`kind` is shipping, returns or refund. Answers 404 `policy_unavailable`
    until staff publish a complete, dated version — there is no default text.

    Policy prose only: rates live on `/public/checkout/shipping-options/`,
    raising a return on `/customer/orders/<id>/returns/`.
    """

    serializer_class = PublicStorePolicySerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [PublicReadRateThrottle]

    def get(self, request, kind) -> Response:
        if kind not in PolicyKind.values:
            return not_found("policy_not_found", "Unknown policy.")
        policy = get_published_policy(kind)
        if policy is None:
            return not_found("policy_unavailable", "This policy has not been published.")
        if kind == PolicyKind.RETURNS:
            data = PublicReturnPolicySerializer(
                policy, context={"returns_enabled": returns_enabled()}
            ).data
        else:
            data = PublicStorePolicySerializer(policy).data
        return Response({"data": data, "message": "Success"})


@extend_schema(tags=["Public Business"])
class PublicStorefrontContentView(APIView):
    """Active hero slides and promo strip lines, in display order, and the
    popup to show now on the shop home page and on the pre-order page, each
    null when there is none."""

    serializer_class = PublicStorefrontContentSerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [PublicReadRateThrottle]

    def get(self, request) -> Response:
        content = {
            "hero_slides": hero_slides_list(active_only=True),
            "promo_lines": promo_lines_list(active_only=True),
            "promotion_popup": eligible_promotion_popup(),
            "preorder_popup": eligible_preorder_popup(),
        }
        data = PublicStorefrontContentSerializer(content, context={"request": request}).data
        return Response({"data": data, "message": "Success"})
