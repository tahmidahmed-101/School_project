#!/usr/bin/env python
"""Purge leftover E2E-test rows from the development database.

Dry run by default; `--apply` is required to delete anything. Rows referenced by
data outside the purge set are retained rather than cascaded away.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from collections import Counter
from pathlib import Path
from typing import cast

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

import django  # noqa: E402

django.setup()

from django.conf import settings  # noqa: E402
from django.db import transaction  # noqa: E402
from django.db.models import Model  # noqa: E402
from django.db.models.deletion import SET_DEFAULT, SET_NULL  # noqa: E402
from django.db.models.fields.reverse_related import ForeignObjectRel  # noqa: E402

from apps.accounting.models.account import Account  # noqa: E402
from apps.accounting.models.expense import Expense  # noqa: E402
from apps.accounting.models.expense_category import ExpenseCategory  # noqa: E402
from apps.accounting.models.tax_rate import TaxRate  # noqa: E402
from apps.accounts.models.user import User  # noqa: E402
from apps.logistics.models.carrier import Carrier  # noqa: E402
from apps.logistics.models.shipping_zone import ShippingZone  # noqa: E402

_B36 = r"[0-9a-z]{4,14}"
_NAME_RE = re.compile(rf"E2E {_B36}(?:-edit)?")
# Shared fixtures, not per-run junk: specs may assume they already exist.
_EMAIL_RE = re.compile(rf"e2e-mta{_B36}@example\.com")
# 13-digit epoch-ms from 2020-09 onwards; too long to collide with an account
# code, an order reference or a human name.
_EPOCH_RE = re.compile(r"\b1[6-9][0-9]{11}\b")

# Declared referrers-first so the delete pass never has to walk backwards.
TARGETS: tuple[tuple[type[Model], tuple[str, ...]], ...] = (
    (Expense, ("payee", "reference_number")),
    (ExpenseCategory, ("name", "description")),
    (TaxRate, ("name", "region")),
    (Carrier, ("name", "contact_email")),
    (ShippingZone, ("name",)),
    (Account, ("code", "name")),
    (User, ("email", "first_name")),
)
ORDER = [model for model, _ in TARGETS]

# on_delete verbs that leave the referring row alive and intact.
_NON_DESTRUCTIVE = frozenset({SET_NULL, SET_DEFAULT})


def out(line: str = "") -> None:
    sys.stdout.write(f"{line}\n")


def match_reason(field: str, value: str) -> str | None:
    if _NAME_RE.fullmatch(value):
        return "name"
    if field in {"email", "contact_email"} and _EMAIL_RE.fullmatch(value):
        return "email"
    if _EPOCH_RE.search(value):
        return "epoch-ms"
    return None


def row_reason(obj: Model, fields: tuple[str, ...]) -> str | None:
    for field in fields:
        value = (getattr(obj, field, "") or "").strip()
        if value and (reason := match_reason(field, value)):
            return reason
    return None


def blocks(rel) -> bool:
    """A reference blocks deletion unless it merely nulls/defaults the referrer.

    `related_objects` deliberately omits `related_name="+"` relations, which here
    are exactly the created_by/updated_by/deleted_by audit stamps and the
    auto-created m2m through tables — neither is business data.
    """
    if rel.many_to_many:
        return True
    return rel.field.remote_field.on_delete not in _NON_DESTRUCTIVE


def referrers(
    model: type[Model], pk, pending: dict[type[Model], set]
) -> list[tuple[str, int, int]]:
    found = []
    for rel in model._meta.related_objects:
        if not blocks(rel):
            continue
        related = cast("type[Model]", rel.related_model)
        qs = related._default_manager.filter(**{rel.field.name: pk})
        total = qs.count()
        if not total:
            continue
        inside = qs.filter(pk__in=pending.get(related, set())).count()
        found.append((f"{related.__name__}.{rel.field.name}", total, inside))
    return found


def label(obj: Model, fields: tuple[str, ...]) -> str:
    parts = [f"{f}={getattr(obj, f)!r}" for f in fields if (getattr(obj, f, "") or "")]
    return f"{str(obj.pk)[:8]}  " + "  ".join(parts)


def _looks_testy(value: str) -> bool:
    low = value.lower()
    return "e2e" in low or low.endswith("@example.com")


def collect() -> tuple[dict, dict, list[str]]:
    matched: dict[type[Model], dict] = {}
    reasons: dict[type[Model], dict] = {}
    suspicious: list[str] = []
    for model, fields in TARGETS:
        rows, why = {}, {}
        for obj in model._default_manager.all():
            reason = row_reason(obj, fields)
            if reason:
                rows[obj.pk] = obj
                why[obj.pk] = reason
            elif any(_looks_testy(getattr(obj, f, "") or "") for f in fields):
                suspicious.append(f"{model.__name__}: {label(obj, fields)}")
        matched[model] = rows
        reasons[model] = why
    return matched, reasons, suspicious


def resolve(matched: dict) -> tuple[dict, dict]:
    """Fixed point: drop rows referenced from outside the shrinking purge set."""
    pending = {model: set(rows) for model, rows in matched.items()}
    retained: dict[type[Model], dict] = {model: {} for model in pending}
    changed = True
    while changed:
        changed = False
        for model in ORDER:
            for pk in sorted(pending[model], key=str):
                outside = [
                    f"{name} ({total - inside} row(s))"
                    for name, total, inside in referrers(model, pk, pending)
                    if total > inside
                ]
                if outside:
                    pending[model].discard(pk)
                    retained[model][pk] = ", ".join(outside)
                    changed = True
    return pending, retained


def side_effects(pending: dict) -> tuple[list[str], list[str]]:
    """What the audit-stamp and m2m-plumbing relations do to rows we keep."""
    nulled: list[str] = []
    removed: list[str] = []
    for model in ORDER:
        pks = pending[model]
        if not pks:
            continue
        for field in model._meta._get_fields(forward=False, reverse=True, include_hidden=True):
            if not getattr(field, "hidden", False) or field.many_to_many:
                continue
            rel = cast(ForeignObjectRel, field)
            related = cast("type[Model]", rel.related_model)
            qs = related._default_manager.filter(**{f"{rel.field.name}__in": pks})
            count = qs.exclude(pk__in=pending.get(related, set())).count()
            if not count:
                continue
            line = f"{related.__name__}.{rel.field.name} ({count})"
            target = nulled if rel.field.remote_field.on_delete in _NON_DESTRUCTIVE else removed
            target.append(line)
    return nulled, removed


def purge(pending: dict) -> Counter:
    deleted: Counter = Counter()
    while any(pending[model] for model in ORDER):
        progressed = False
        for model in ORDER:
            for pk in sorted(pending[model], key=str):
                if any(inside for _, _, inside in referrers(model, pk, pending)):
                    continue
                model._default_manager.filter(pk=pk).delete()
                pending[model].discard(pk)
                deleted[model] += 1
                progressed = True
        if not progressed:
            raise RuntimeError("reference cycle among E2E rows; rolling back")
    return deleted


def report(matched, reasons, pending, retained, suspicious) -> None:
    for model, fields in TARGETS:
        rows = matched[model]
        out(f"{model.__name__} — {len(rows)} matched of {model._default_manager.count()}")
        if not rows:
            out("    (nothing)")
        for pk, obj in sorted(rows.items(), key=lambda kv: label(kv[1], fields)):
            flag = "" if reasons[model][pk] != "epoch-ms" else "  <epoch-ms match>"
            if pk in pending[model]:
                out(f"  DELETE  {label(obj, fields)}{flag}")
            else:
                out(f"  RETAIN  {label(obj, fields)}  <- referenced by {retained[model][pk]}")
        out()

    if suspicious:
        out("Test-looking but did NOT match the purge patterns — left untouched:")
        for line in suspicious:
            out(f"  {line}")
        out()

    nulled, removed = side_effects(pending)
    if nulled or removed:
        out("Side effects on rows outside the purge set:")
        for line in nulled:
            out(f"  set to NULL   {line}")
        for line in removed:
            out(f"  removed       {line}")
        out()


def summary(matched, pending, retained, deleted: Counter | None) -> None:
    out(f"{'model':<20}{'matched':>9}{'delete':>9}{'retain':>9}")
    out("-" * 47)
    totals = [0, 0, 0]
    for model in ORDER:
        counts = (len(matched[model]), len(pending[model]), len(retained[model]))
        totals = [a + b for a, b in zip(totals, counts, strict=True)]
        out(f"{model.__name__:<20}{counts[0]:>9}{counts[1]:>9}{counts[2]:>9}")
    out("-" * 47)
    out(f"{'TOTAL':<20}{totals[0]:>9}{totals[1]:>9}{totals[2]:>9}")
    if deleted is not None:
        out(f"\nrows actually deleted: {sum(deleted.values())}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--dry-run", action="store_true", help="default; report only")
    group.add_argument("--apply", action="store_true", help="actually delete the matched rows")
    args = parser.parse_args()

    mode = "APPLY (destructive)" if args.apply else "DRY RUN (no changes written)"
    out(f"E2E purge — {mode}")
    out(f"settings: {os.environ['DJANGO_SETTINGS_MODULE']}")
    out(f"database: {settings.DATABASES['default']['NAME']}")
    out()

    matched, reasons, suspicious = collect()
    pending, retained = resolve(matched)
    snapshot = {model: set(pks) for model, pks in pending.items()}
    report(matched, reasons, snapshot, retained, suspicious)

    deleted = None
    if args.apply:
        with transaction.atomic():
            deleted = purge(pending)
    summary(matched, snapshot, retained, deleted)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
