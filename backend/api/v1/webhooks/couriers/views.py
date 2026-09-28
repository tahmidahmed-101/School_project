from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.exceptions import DomainError
from apps.common.responses import error_from_exception, not_found
from apps.logistics.selectors.rates import get_carrier_by_id
from apps.logistics.services.couriers.webhooks import handle_courier_webhook


@extend_schema(tags=["Courier Webhooks"], exclude=True)
class CourierWebhookView(APIView):
    """Inbound status callbacks from a courier. Authenticated by the
    carrier's own webhook secret (see `CourierGateway.verify_webhook`), not by
    a session or API token."""

    permission_classes: ClassVar[list] = [AllowAny]

    def post(self, request, carrier_id) -> Response:
        carrier = get_carrier_by_id(carrier_id)
        if carrier is None:
            return not_found("carrier_not_found", "Carrier not found.")

        try:
            ack_status, ack_headers, ack_body = handle_courier_webhook(
                carrier,
                headers=dict(request.headers),
                query=request.query_params.dict(),
                body=request.body,
                payload=request.data if isinstance(request.data, dict) else {},
            )
        except DomainError as exc:
            return error_from_exception(exc, status_code=401)

        response = Response(ack_body, status=ack_status)
        for name, value in ack_headers.items():
            response[name] = value
        return response
