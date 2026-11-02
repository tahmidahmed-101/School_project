from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from django.db import migrations

QUARTER_CENT = Decimal("0.0001")


def merge_stock_items(apps, schema_editor):
    """Collapse one StockItem per (variant, warehouse) into one per variant.

    Quantities add up; `avg_cost` is weighted by on-hand quantity so the GL cost
    basis moves as little as possible. Irreversible — the per-warehouse split is
    not recoverable afterwards.
    """
    StockItem = apps.get_model("inventory", "StockItem")

    by_variant: dict[str, list] = {}
    for item in StockItem.objects.all().order_by("created_at", "id"):
        by_variant.setdefault(str(item.variant_id), []).append(item)

    doomed_ids: list[object] = []
    for items in by_variant.values():
        if len(items) == 1:
            continue
        survivor, *rest = items
        total_on_hand = sum(i.quantity_on_hand for i in items)
        if total_on_hand > 0:
            weighted = sum(i.avg_cost * i.quantity_on_hand for i in items)
            survivor.avg_cost = (weighted / total_on_hand).quantize(
                QUARTER_CENT, rounding=ROUND_HALF_UP
            )
        else:
            costs = [i.avg_cost for i in items if i.avg_cost]
            survivor.avg_cost = max(costs) if costs else Decimal("0")
        survivor.quantity_on_hand = total_on_hand
        survivor.quantity_reserved = sum(i.quantity_reserved for i in items)
        survivor.reorder_point = sum(i.reorder_point for i in items)
        survivor.target_stock_level = sum(i.target_stock_level for i in items)
        survivor.save(
            update_fields=[
                "quantity_on_hand",
                "quantity_reserved",
                "reorder_point",
                "target_stock_level",
                "avg_cost",
                "updated_at",
            ]
        )
        doomed_ids.extend(i.id for i in rest)

    StockItem.objects.filter(id__in=doomed_ids).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0006_remove_stockitem_inventory_s_warehou_ea4f31_idx_and_more"),
    ]

    operations = [
        migrations.RunPython(merge_stock_items, migrations.RunPython.noop),
    ]
