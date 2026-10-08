from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser

from apps.common.services.demo_seed.constants import BRAND, DEMO_DOMAIN, DEMO_PASSWORD
from apps.common.services.demo_seed.seeder import DemoSeeder
from apps.common.services.demo_seed.wipe import wipe_demo_data

DEFAULT_SEED = 20250814


class Command(BaseCommand):
    help = (
        f"Seed a full, demo-ready {BRAND} dataset — catalog, inventory, orders, procurement, "
        "accounting, promotions and customers. Re-runnable; --fresh rebuilds it."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--fresh", action="store_true", help="Wipe previously seeded demo rows first."
        )
        parser.add_argument("--orders", type=int, default=120)
        parser.add_argument("--days", type=int, default=120)
        parser.add_argument("--customers", type=int, default=30)
        parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
        parser.add_argument(
            "--allow-production",
            action="store_true",
            help="Run even under production settings: fake orders land in the live shop.",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        if (settings.SETTINGS_MODULE or "").endswith(".production") and not options[
            "allow_production"
        ]:
            raise CommandError(
                "seed_demo writes fake orders and known logins; refusing under production settings."
            )
        if options["fresh"]:
            removed = wipe_demo_data()
            summary = ", ".join(f"{key}={value}" for key, value in sorted(removed.items()))
            self.stdout.write(f"Wiped previous demo data ({summary}).")

        seeder = DemoSeeder(
            orders=options["orders"],
            days=options["days"],
            customers=options["customers"],
            seed=options["seed"],
            writer=self.stdout.write,
        )
        counts = seeder.run()

        for key, value in sorted(counts.items()):
            self.stdout.write(f"  {key:<20} {value}")
        self.stdout.write(
            f"Logins (password {DEMO_PASSWORD}): admin@{DEMO_DOMAIN}, staff@{DEMO_DOMAIN}, "
            f"customer {seeder.customers[0].email}"
        )
        self.stdout.write(self.style.SUCCESS(f"{BRAND} demo dataset ready."))
