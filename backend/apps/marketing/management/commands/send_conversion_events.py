from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.marketing.services.conversions import retry_conversion_events


class Command(BaseCommand):
    help = (
        "Send server-side conversion events (GA4 / Meta Purchase) that are pending, "
        "failed with attempts left, or were interrupted mid-send."
    )

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=200)

    def handle(self, *args, **options) -> None:
        sent = retry_conversion_events(limit=options["limit"])
        self.stdout.write(self.style.SUCCESS(f"Sent {sent} conversion event(s)."))
