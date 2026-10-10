from __future__ import annotations

import json
import urllib.error
from unittest.mock import MagicMock, patch

from apps.common.services.telegram import send_telegram

URLOPEN = "apps.common.services.telegram.urllib.request.urlopen"


def test_send_telegram_is_off_until_token_and_chat_are_set(settings):
    settings.TELEGRAM_BOT_TOKEN = ""
    settings.TELEGRAM_ALERT_CHAT_ID = "42"

    with patch(URLOPEN) as urlopen:
        assert send_telegram(text="hello") is False

    urlopen.assert_not_called()


def test_send_telegram_posts_the_text_to_the_alert_chat(settings):
    settings.TELEGRAM_BOT_TOKEN = "test-token"
    settings.TELEGRAM_ALERT_CHAT_ID = "42"
    response = MagicMock(status=200)
    response.__enter__.return_value = response

    with patch(URLOPEN, return_value=response) as urlopen:
        assert send_telegram(text="hello") is True

    request = urlopen.call_args.args[0]
    assert request.full_url == "https://api.telegram.org/bottest-token/sendMessage"
    assert json.loads(request.data) == {"chat_id": "42", "text": "hello"}
    assert urlopen.call_args.kwargs["timeout"] > 0


def test_send_telegram_swallows_a_failed_send(settings):
    settings.TELEGRAM_BOT_TOKEN = "test-token"
    settings.TELEGRAM_ALERT_CHAT_ID = "42"

    with patch(URLOPEN, side_effect=urllib.error.URLError("down")):
        assert send_telegram(text="hello") is False
