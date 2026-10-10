from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request

from django.conf import settings
from django.db import transaction

logger = logging.getLogger("apps")

SEND_TIMEOUT_SECONDS = 10


def send_telegram(*, text: str) -> bool:
    if not settings.TELEGRAM_BOT_TOKEN or not settings.TELEGRAM_ALERT_CHAT_ID:
        return False

    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    body = json.dumps({"chat_id": settings.TELEGRAM_ALERT_CHAT_ID, "text": text}).encode("utf-8")
    request = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(request, timeout=SEND_TIMEOUT_SECONDS) as response:  # noqa: S310
            return response.status == 200
    except (urllib.error.URLError, TimeoutError, OSError):
        # Never log the URL: it carries the bot token.
        logger.error("Telegram alert failed")
        return False


def alert_staff(text: str) -> None:
    """Send a staff alert once the surrounding transaction has committed, so a
    rolled-back order is never announced and no row lock is held while
    Telegram answers. A failed send never fails the request."""
    transaction.on_commit(lambda: send_telegram(text=text), robust=True)
