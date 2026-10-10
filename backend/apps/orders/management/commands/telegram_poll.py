from __future__ import annotations

import time

from django.core.management.base import BaseCommand, CommandError

from apps.common.services.telegram import call_telegram
from apps.orders.services.telegram_bot import handle_update


class Command(BaseCommand):
    help = (
        "Run the staff Telegram bot by long polling, for local development where "
        "Telegram cannot reach a webhook. Production uses the webhook instead; "
        "Telegram refuses polling while one is registered."
    )

    def handle(self, *args, **options):
        if call_telegram("getMe", {}) is None:
            raise CommandError("Telegram did not accept TELEGRAM_BOT_TOKEN (or it is not set).")
        self.stdout.write("Polling Telegram. Ctrl+C to stop.")
        offset = 0
        while True:
            updates = call_telegram("getUpdates", {"offset": offset, "timeout": 25}, timeout=35)
            if updates is None:
                # Usually a second poller for the same bot: Telegram allows one.
                time.sleep(5)
            for update in updates or []:
                offset = update["update_id"] + 1
                handle_update(update)
