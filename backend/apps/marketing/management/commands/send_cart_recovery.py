from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.marketing.services.cart_recovery import send_cart_recovery


class Command(BaseCommand):
    help = (
        "Text a shopper once about a cart left idle (CART_RECOVERY_IDLE_HOURS to "
        "CART_RECOVERY_MAX_AGE_HOURS), up to CART_RECOVERY_DAILY_CAP a Dhaka day. "
        "Does nothing while the business setting is off. Safe to run any number of times."
    )

    def handle(self, *args, **options) -> None:
        result = send_cart_recovery()
        if result["reason"]:
            self.stdout.write(f"Cart recovery skipped: {result['reason']}.")
            return
        self.stdout.write(self.style.SUCCESS(f"Sent {result['sent']} cart reminder(s)."))
