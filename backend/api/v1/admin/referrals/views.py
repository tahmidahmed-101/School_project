from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework.response import Response

from apps.common.generics import GenericListAPIView
from apps.orders.models import Referral
from apps.orders.selectors.referrals import referrals_list

from ..coupons.views import CouponsViewPermission
from .serializers import ReferralSerializer


@extend_schema(tags=["Referrals"])
class AdminReferralListView(GenericListAPIView):
    serializer_class = ReferralSerializer
    permission_classes: ClassVar[list] = [CouponsViewPermission]
    search_fields = ("order__order_number", "referrer__phone", "referrer__email")
    ordering_fields = ("created_at", "rewarded_at")
    default_ordering = "-created_at"

    def get_queryset(self):
        queryset = referrals_list()
        status = self.request.query_params.get("status")
        if status in Referral.Status.values:
            return queryset.filter(status=status)
        return queryset

    def get(self, request) -> Response:
        return self.list_response(request)
