from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request

from django.conf import settings

logger = logging.getLogger("apps")

SEND_TIMEOUT_SECONDS = 5


def call_telegram(method: str, payload: dict, *, timeout: int = SEND_TIMEOUT_SECONDS):
    """One Bot API call. Returns the `result` on success and None on any
    failure, or when no bot token is configured."""
    if not settings.TELEGRAM_BOT_TOKEN:
        return None

    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/{method}"
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
            return json.loads(response.read()).get("result")
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        # Never log the URL: it carries the bot token.
        logger.error("Telegram %s failed", method)
        return None


def send_telegram(*, chat_id: int, text: str, reply_markup: dict | None = None) -> bool:
    payload: dict = {"chat_id": chat_id, "text": text}
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
    return call_telegram("sendMessage", payload) is not None
