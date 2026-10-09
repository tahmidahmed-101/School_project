from __future__ import annotations

from collections import Counter, defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounting.models import JournalEntry
from apps.accounting.selectors.kind import KINDED_REFERENCE_TYPES, kinds_for_references

BATCH = 1000


class Command(BaseCommand):
    help = (
        "Mark existing journal entries as stock or pre-order from the order, purchase or "
        "stock movement they were posted for. Entries with no such document (expenses, "
        "manual entries) stay company-wide. Prints what it would change; pass --apply to write."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument("--apply", action="store_true", help="Write the changes.")

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        apply = options["apply"]
        verb = "marked" if apply else "would mark"
        blank = JournalEntry.objects.filter(kind="")
        counts: Counter = Counter()
        missing: Counter = Counter()

        for reference_type in KINDED_REFERENCE_TYPES:
            rows = list(
                blank.filter(reference_type=reference_type, reference_id__isnull=False).values_list(
                    "id", "reference_id"
                )
            )
            kinds: dict = {}
            reference_ids = list({reference_id for _, reference_id in rows})
            for offset in range(0, len(reference_ids), BATCH):
                kinds.update(
                    kinds_for_references(reference_type, reference_ids[offset : offset + BATCH])
                )
            entry_ids_by_kind = defaultdict(list)
            for entry_id, reference_id in rows:
                kind = kinds.get(reference_id)
                if kind in JournalEntry.Kind.values:
                    entry_ids_by_kind[kind].append(entry_id)
                else:
                    missing[reference_type] += 1
            for kind, entry_ids in entry_ids_by_kind.items():
                counts[(reference_type, kind)] = len(entry_ids)
                if not apply:
                    continue
                for offset in range(0, len(entry_ids), BATCH):
                    JournalEntry.objects.filter(id__in=entry_ids[offset : offset + BATCH]).update(
                        kind=kind
                    )

        for (reference_type, kind), count in sorted(counts.items()):
            self.stdout.write(f"{reference_type}: {verb} {count} as {kind}")
        for reference_type, count in sorted(missing.items()):
            self.stdout.write(
                f"{reference_type}: {count} left company-wide, source document not found"
            )
        total = sum(counts.values())
        company_wide = blank.count() if apply else blank.count() - total
        self.stdout.write(f"{company_wide} entries stay company-wide (no kind).")
        if apply:
            self.stdout.write(self.style.SUCCESS(f"Marked {total} journal entries."))
        else:
            self.stdout.write(f"Dry run: {total} journal entries to mark. Pass --apply to write.")
