from __future__ import annotations

import urllib.error
from unittest.mock import patch

from apps.common.services.telegram import SEND_TIMEOUT_SECONDS, send_telegram

URLOPEN = "apps.common.services.telegram.urllib.request.urlopen"


def test_send_telegram_is_off_without_a_bot_token(settings):
    settings.TELEGRAM_BOT_TOKEN = ""

    with patch(URLOPEN) as urlopen:
        assert send_telegram(chat_id=42, text="hello") is False

    urlopen.assert_not_called()


def test_send_telegram_posts_the_text_and_buttons_to_the_chat(telegram_outbox):
    keyboard = {"inline_keyboard": [[{"text": "Go", "callback_data": "go:1"}]]}

    assert send_telegram(chat_id=42, text="hello", reply_markup=keyboard) is True

    assert telegram_outbox == [
        ("sendMessage", {"chat_id": 42, "text": "hello", "reply_markup": keyboard})
    ]


def test_send_telegram_swallows_a_failed_or_timed_out_send(settings):
    settings.TELEGRAM_BOT_TOKEN = "test-token"

    for failure in (urllib.error.URLError("down"), TimeoutError()):
        with patch(URLOPEN, side_effect=failure) as urlopen:
            assert send_telegram(chat_id=42, text="hello") is False
        assert urlopen.call_args.kwargs["timeout"] == SEND_TIMEOUT_SECONDS
