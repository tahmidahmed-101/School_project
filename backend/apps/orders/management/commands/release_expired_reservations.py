from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.orders.services.reservations import release_expired_reservations


class Command(BaseCommand):
    help = "Release stock reservations that are past their expiry."

    def handle(self, *args, **options) -> None:
        released = release_expired_reservations()
        self.stdout.write(self.style.SUCCESS(f"Released {released} expired reservation(s)."))
