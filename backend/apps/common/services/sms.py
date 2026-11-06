from __future__ import annotations

import logging

from django.conf import settings
from twilio.base.exceptions import TwilioException, TwilioRestException
from twilio.http.http_client import TwilioHttpClient
from twilio.rest import Client as TwilioClient

logger = logging.getLogger("apps")

SEND_TIMEOUT_SECONDS = 10

NOT_CONFIGURED = "not_configured"
NO_RECIPIENT = "no_recipient"
# The number can never receive this message; retrying it only costs money.
RECIPIENT_REFUSED = "recipient_refused"
PROVIDER_ERROR = "provider_error"
NETWORK_ERROR = "network_error"

# Twilio: 21211 invalid To, 21614 To is not a mobile, 21610 recipient replied STOP.
_REFUSED_CODES = {21211, 21614, 21610}


class SmsDeliveryError(Exception):
    """`reason` is one of the codes above, never the provider's own text."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def sms_configured() -> bool:
    return bool(
        settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_PHONE_NUMBER
    )


def deliver_sms(*, to: str, body: str) -> None:
    """Send one message or raise SmsDeliveryError saying why not."""
    if not sms_configured():
        raise SmsDeliveryError(NOT_CONFIGURED)
    if not to:
        raise SmsDeliveryError(NO_RECIPIENT)

    try:
        # Without an explicit timeout the request can hang for as long as the
        # socket stays open, holding a gunicorn worker the whole time.
        client = TwilioClient(
            settings.TWILIO_ACCOUNT_SID,
            settings.TWILIO_AUTH_TOKEN,
            http_client=TwilioHttpClient(timeout=SEND_TIMEOUT_SECONDS),
        )
        message = client.messages.create(body=body, from_=settings.TWILIO_PHONE_NUMBER, to=to)
    except TwilioRestException as exc:
        logger.warning("SMS provider refused the message (code %s)", exc.code)
        raise SmsDeliveryError(
            RECIPIENT_REFUSED if exc.code in _REFUSED_CODES else PROVIDER_ERROR
        ) from exc
    except (TwilioException, OSError) as exc:
        logger.warning("SMS send failed: %s", type(exc).__name__)
        raise SmsDeliveryError(NETWORK_ERROR) from exc
    if message.sid is None:
        raise SmsDeliveryError(PROVIDER_ERROR)


_TRANSIENT = {PROVIDER_ERROR, NETWORK_ERROR}
OTP_ATTEMPTS = 2


def send_sms(*, to: str, body: str) -> bool:
    """The OTP path: it only needs to know whether the message went.

    A dropped connection or provider 5xx is retried once; a refused number or a
    missing account is not, since a second try cannot change the answer.
    """
    for attempt in range(1, OTP_ATTEMPTS + 1):
        try:
            deliver_sms(to=to, body=body)
        except SmsDeliveryError as exc:
            if exc.reason not in _TRANSIENT or attempt == OTP_ATTEMPTS:
                logger.warning("OTP SMS not sent: %s after %d attempt(s)", exc.reason, attempt)
                return False
        else:
            return True
    return False
