from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.business.models import HeroPlacement, HeroSlide, PromoLine
from apps.business.services.storefront_content import HERO_SLIDE_FIELDS, PROMO_LINE_FIELDS


class Command(BaseCommand):
    help = (
        "Split every hero slide and promo line placed on both shops into two rows: the "
        "existing row stays on the home shop and a copy goes to the pre-order shop. "
        "Prints what it would change; pass --apply to write."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument("--apply", action="store_true", help="Write the changes.")

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        apply = options["apply"]
        verb = "split" if apply else "would split"
        total = 0
        for model, fields, noun in (
            (HeroSlide, HERO_SLIDE_FIELDS, "hero slide"),
            (PromoLine, PROMO_LINE_FIELDS, "promo line"),
        ):
            for row in model.objects.filter(placement=HeroPlacement.BOTH).order_by(
                "sort_order", "created_at"
            ):
                total += 1
                self.stdout.write(f"{noun} {row.pk} ({row}): {verb} into home + pre-order")
                if not apply:
                    continue
                # The copy points at the same image file; rows never delete files.
                copy = model(**{field: getattr(row, field) for field in fields})
                copy.placement = HeroPlacement.PREORDER
                # Same creation time, so rows with equal sort order keep their place on the page.
                copy.created_at = row.created_at
                copy.save()
                model.objects.filter(pk=row.pk).update(placement=HeroPlacement.HOME)
        if apply:
            self.stdout.write(f"{total} row(s) split.")
        else:
            self.stdout.write(f"{total} row(s) would be split. Dry run; nothing written.")
