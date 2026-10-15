from __future__ import annotations

import secrets
from typing import ClassVar

from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.responses import error_response
from apps.orders.services.telegram_bot import handle_update


@extend_schema(tags=["Telegram Webhook"], exclude=True)
class TelegramWebhookView(APIView):
    """Inbound updates from Telegram. Authenticated by the secret Telegram
    echoes back in a header (set with `setWebhook`), not by a session or API
    token; who the sender is gets checked per update, by the bot itself."""

    authentication_classes: ClassVar[list] = []
    permission_classes: ClassVar[list] = [AllowAny]

    def post(self, request) -> Response:
        expected = settings.TELEGRAM_WEBHOOK_SECRET
        given = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        if not expected or not secrets.compare_digest(given.encode(), expected.encode()):
            return error_response("forbidden", "Forbidden.", status=403)
        if isinstance(request.data, dict):
            handle_update(request.data)
        # Always 200 once authenticated: anything else makes Telegram resend.
        return Response({"ok": True})
