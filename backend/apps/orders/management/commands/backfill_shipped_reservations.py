from __future__ import annotations

from collections import Counter

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Sum

from apps.inventory.models import StockItem
from apps.orders.models import StockReservation
from apps.orders.services.reservations import release_line_reservations


def _total_reserved() -> int:
    return StockItem.objects.aggregate(total=Sum("quantity_reserved"))["total"] or 0


class Command(BaseCommand):
    help = (
        "Close StockReservation rows left ACTIVE on fully shipped order lines. "
        "Rows only — create_shipment already returned these units to Available, "
        "so quantity_reserved must not move. Dry run unless --apply is given."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Actually close the rows. Without this the command reports and rolls back.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Explicit no-op form of the default behaviour.",
        )

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        if apply_changes and options["dry_run"]:
            raise CommandError("--apply and --dry-run are mutually exclusive.")

        active = (
            StockReservation.objects.filter(status=StockReservation.Status.ACTIVE)
            .select_related("order_line", "order_line__order")
            .order_by("created_at")
        )

        shipped_lines: dict[str, object] = {}
        by_status: Counter = Counter()
        scanned = 0
        partial_rows = 0
        partial_lines: set[str] = set()

        for reservation in active:
            scanned += 1
            line = reservation.order_line
            if line.shippable_quantity == 0:
                shipped_lines[str(line.id)] = line
                by_status[line.order.status] += 1
            elif line.shipped_quantity > 0:
                partial_rows += 1
                partial_lines.add(str(line.id))

        before = _total_reserved()
        closed = 0
        with transaction.atomic():
            for line in shipped_lines.values():
                closed += release_line_reservations(order_line=line)
            after = _total_reserved()
            if after != before:
                transaction.set_rollback(True)
                raise CommandError(
                    f"ABORTED: sum(quantity_reserved) moved {before} -> {after}. "
                    "This backfill must close reservation rows only; the counter was "
                    "already decremented at shipment time. Nothing was written."
                )
            if not apply_changes:
                transaction.set_rollback(True)

        mode = "APPLIED" if apply_changes else "DRY RUN — no changes written"
        self.stdout.write(f"Mode: {mode}")
        self.stdout.write(f"Active reservations scanned: {scanned}")
        self.stdout.write(
            f"Rows to close on fully shipped lines: {closed} "
            f"across {len(shipped_lines)} order line(s)"
        )
        for status, count in sorted(by_status.items()):
            self.stdout.write(f"  order status {status}: {count}")
        self.stdout.write(
            f"Skipped (partially shipped): {partial_rows} row(s) "
            f"across {len(partial_lines)} order line(s)"
        )
        self.stdout.write(f"sum(StockItem.quantity_reserved): {before} -> {after} (unchanged)")

        if apply_changes:
            self.stdout.write(self.style.SUCCESS(f"Closed {closed} reservation row(s)."))
        else:
            self.stdout.write(
                self.style.WARNING("Dry run. Re-run with --apply to write these changes.")
            )
