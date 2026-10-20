from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.marketing.services.campaigns import process_campaigns


class Command(BaseCommand):
    help = (
        "Start newsletter campaigns that are due and send the next batch of copies "
        "(at most CAMPAIGN_BATCH_SIZE). Safe to run any number of times."
    )

    def add_arguments(self, parser):
        parser.add_argument("--batch-size", type=int, default=None)

    def handle(self, *args, **options) -> None:
        result = process_campaigns(batch_size=options["batch_size"])
        self.stdout.write(
            self.style.SUCCESS(
                f"Started {result['started']} campaign(s), sent {result['sent']} email(s)."
            )
        )
