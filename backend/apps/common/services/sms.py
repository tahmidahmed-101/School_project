from __future__ import annotations

import logging

from django.conf import settings
from twilio.base.exceptions import TwilioException, TwilioRestException
from twilio.http.http_client import TwilioHttpClient
from twilio.rest import Client as TwilioClient

logger = logging.getLogger("apps")

SEND_TIMEOUT_SECONDS = 10


def send_sms(*, to: str, body: str) -> bool:
    if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
        return False

    if not to:
        return False

    try:
        # Without an explicit timeout the request can hang for as long as the
        # socket stays open, holding a gunicorn worker the whole time.
        client = TwilioClient(
            settings.TWILIO_ACCOUNT_SID,
            settings.TWILIO_AUTH_TOKEN,
            http_client=TwilioHttpClient(timeout=SEND_TIMEOUT_SECONDS),
        )
        message = client.messages.create(
            body=body,
            from_=settings.TWILIO_PHONE_NUMBER,
            to=to,
        )
        return message.sid is not None
    except (TwilioRestException, TwilioException, OSError):
        # Swallowing this silently made every delivery failure look identical
        # to "Twilio not configured" in production.
        logger.exception("SMS send failed")
        return False
