from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q, Sum

from apps.common.params import KIND_PREORDER, KIND_STOCK
from apps.inventory.models import StockItem, StockLedgerEntry, Warehouse
from apps.inventory.selectors.warehouse import (
    NEW_DEFAULT_WAREHOUSE,
    default_warehouse,
    get_or_create_default_warehouse,
)

PREORDER_VARIANT = {"variant__product__category__category_type": KIND_PREORDER}
NAME_SUFFIX = " (pre-order)"
CODE_SUFFIX = "-PRE"


class Command(BaseCommand):
    help = (
        "Move pre-order goods out of the stock warehouses. Each stock warehouse holding "
        "pre-order items gets a pre-order warehouse of the same name, and those stock rows "
        "and their ledger rows move to it with the same quantities. Pre-order rows that never "
        "held anything are removed. A default pre-order warehouse is made if there is none. "
        "Prints what it would change; pass --apply to write."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument("--apply", action="store_true", help="Write the changes.")

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        self.apply = options["apply"]
        self.default_planned = False
        changed = sum(
            self._split(warehouse)
            for warehouse in Warehouse.objects.filter(kind=KIND_STOCK).order_by("name", "id")
        )
        changed += self._ensure_default()
        if self.apply:
            self.stdout.write(f"{changed} row(s) changed.")
        else:
            self.stdout.write(f"{changed} row(s) would change. Dry run; nothing written.")

    def _say(self, label: str, done: str, planned: str) -> None:
        self.stdout.write(f"{label}: {done if self.apply else planned}")

    def _split(self, source: Warehouse) -> int:
        items = StockItem.objects.filter(warehouse=source, **PREORDER_VARIANT)
        ledger = StockLedgerEntry.objects.filter(warehouse=source, **PREORDER_VARIANT)
        item_count, ledger_count = items.count(), ledger.count()
        if not item_count and not ledger_count:
            return 0
        label = f"Warehouse {source.name!r}"
        holds_goods = items.filter(Q(quantity_on_hand__gt=0) | Q(quantity_reserved__gt=0)).exists()
        if not ledger_count and not holds_goods:
            emptied = f"{item_count} empty pre-order stock row(s)"
            self._say(label, f"{emptied} removed", f"would remove {emptied}")
            if self.apply:
                items.delete()
            return item_count
        is_default = source.is_default and source.deleted_at is None
        target = self._existing_target(source, is_default)
        is_new = target is None
        totals = items.aggregate(on_hand=Sum("quantity_on_hand"), reserved=Sum("quantity_reserved"))
        moved = (
            f"{item_count} pre-order stock row(s) ({totals['on_hand'] or 0} on hand, "
            f"{totals['reserved'] or 0} reserved) and {ledger_count} ledger row(s)"
        )
        where = (
            f"a new pre-order warehouse {self._twin_name(source)!r}"
            if is_new
            else f"the existing pre-order warehouse {target.name!r}"
        )
        self._say(label, f"{moved} moved to {where}", f"would move {moved} to {where}")
        self.default_planned = self.default_planned or is_default
        if self.apply:
            target = target or self._create_twin(source)
            if is_default and not target.is_default:
                target.is_default = True
                target.save(update_fields=["is_default", "updated_at"])
            for item in items.select_for_update():
                self._move(item, target)
            ledger.update(warehouse=target)
        return item_count + ledger_count + int(is_new)

    def _twin_name(self, source: Warehouse) -> str:
        return f"{source.name[: 150 - len(NAME_SUFFIX)]}{NAME_SUFFIX}"

    def _twin_code(self, source: Warehouse) -> str:
        return f"{source.code[: 32 - len(CODE_SUFFIX)]}{CODE_SUFFIX}"

    def _existing_target(self, source: Warehouse, is_default: bool) -> Warehouse | None:
        if is_default:
            current = default_warehouse(KIND_PREORDER)
            if current is not None:
                return current
        code = self._twin_code(source)
        twin = Warehouse.objects.filter(code=code).first()
        if twin is not None and twin.kind != KIND_PREORDER:
            raise CommandError(
                f"Warehouse code {code!r} is already used by a stock warehouse. Change that "
                "code, then run this again."
            )
        return twin

    def _create_twin(self, source: Warehouse) -> Warehouse:
        return Warehouse.objects.create(
            name=self._twin_name(source),
            code=self._twin_code(source),
            kind=KIND_PREORDER,
            address=source.address,
            is_active=source.is_active,
            deleted_at=source.deleted_at,
        )

    def _move(self, item: StockItem, target: Warehouse) -> None:
        held = (
            StockItem.objects.select_for_update()
            .filter(warehouse=target, variant_id=item.variant_id)
            .first()
        )
        if held is None:
            item.warehouse = target
            item.save(update_fields=["warehouse", "updated_at"])
            return
        on_hand = held.quantity_on_hand + item.quantity_on_hand
        if on_hand:
            held.avg_cost = (
                held.quantity_on_hand * held.avg_cost + item.quantity_on_hand * item.avg_cost
            ) / on_hand
        held.quantity_on_hand = on_hand
        held.quantity_reserved += item.quantity_reserved
        held.save(update_fields=["quantity_on_hand", "quantity_reserved", "avg_cost", "updated_at"])
        item.delete()

    def _ensure_default(self) -> int:
        if self.default_planned or default_warehouse(KIND_PREORDER) is not None:
            return 0
        name = NEW_DEFAULT_WAREHOUSE[KIND_PREORDER]["name"]
        self._say(
            "No default pre-order warehouse",
            f"made an empty one, {name!r}, so pre-order goods can be received",
            f"would make an empty one, {name!r}, so pre-order goods can be received",
        )
        if self.apply:
            get_or_create_default_warehouse(KIND_PREORDER)
        return 1
