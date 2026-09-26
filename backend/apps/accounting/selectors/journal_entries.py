from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from apps.accounting.models import JournalEntry


def journal_entries_list(
    *, status: str | None = None, reference_type: str | None = None
) -> QuerySet[JournalEntry]:
    queryset = JournalEntry.objects.prefetch_related("lines", "reversals").filter(
        deleted_at__isnull=True
    )
    if status:
        queryset = queryset.filter(status=status)
    if reference_type:
        queryset = queryset.filter(reference_type=reference_type)
    return queryset.order_by("-entry_date")


def unreversed_entries_for_reference(
    *, reference_type: str, reference_id: str | UUID
) -> QuerySet[JournalEntry]:
    """Live postings for a source document: excludes reversals themselves and
    anything already reversed, so callers only ever reverse each posting once."""
    already_reversed = JournalEntry.objects.filter(
        reverses__isnull=False, deleted_at__isnull=True
    ).values("reverses_id")
    return (
        JournalEntry.objects.prefetch_related("lines")
        .filter(
            reference_type=reference_type,
            reference_id=reference_id,
            reverses__isnull=True,
            deleted_at__isnull=True,
        )
        .exclude(id__in=already_reversed)
    )


def get_journal_entry_by_id(entry_id: str | UUID) -> JournalEntry | None:
    return (
        JournalEntry.objects.prefetch_related("lines", "reversals")
        .filter(id=entry_id, deleted_at__isnull=True)
        .first()
    )
