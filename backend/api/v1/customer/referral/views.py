from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.exceptions import DomainError
from apps.common.permissions import IsCustomer
from apps.common.responses import error_from_exception
from apps.orders.selectors.referrals import rewards_of
from apps.orders.services.referrals import referral_amounts, referral_code_for

from .serializers import ReferralSummarySerializer


@extend_schema(tags=["Referral"])
class CustomerReferralView(APIView):
    serializer_class = ReferralSummarySerializer
    permission_classes: ClassVar[list] = [IsCustomer]

    def get(self, request) -> Response:
        amounts = referral_amounts()
        try:
            coupon = referral_code_for(request.user)
        except DomainError as exc:
            return error_from_exception(exc)
        summary = {
            "enabled": amounts is not None,
            "code": coupon.code if coupon is not None else None,
            "friend_discount": amounts.friend_discount if amounts else None,
            "reward_amount": amounts.reward if amounts else None,
            "rewards": list(rewards_of(request.user)),
        }
        return Response({"data": ReferralSummarySerializer(summary).data, "message": "Success"})
