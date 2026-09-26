from __future__ import annotations

from django.core.management import call_command


def seed_chart_of_accounts() -> None:
    call_command("seed_chart_of_accounts")
