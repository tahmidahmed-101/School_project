from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.catalog.models import Brand, Product
from apps.common.params import KIND_PREORDER, KIND_STOCK
from apps.common.utils.text import unique_slug_for
from apps.procurement.models import PurchaseOrder, Supplier, VendorBill
from apps.procurement.selectors.kind import filter_by_kind

PRODUCT_KIND = "category__category_type"


def _other(kind: str) -> str:
    return KIND_STOCK if kind == KIND_PREORDER else KIND_PREORDER


class Command(BaseCommand):
    help = (
        "Give every brand and supplier one kind from how it is used. A brand or supplier used "
        "by both stock and pre-order records is copied, and the records of the other kind are "
        "pointed at the copy. Prints what it would change; pass --apply to write."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument("--apply", action="store_true", help="Write the changes.")

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        self.apply = options["apply"]
        changed = sum(self._split_brand(brand) for brand in Brand.objects.order_by("name", "id"))
        changed += sum(
            self._split_supplier(supplier) for supplier in Supplier.objects.order_by("name", "id")
        )
        if self.apply:
            self.stdout.write(f"{changed} row(s) changed.")
        else:
            self.stdout.write(f"{changed} row(s) would change. Dry run; nothing written.")

    def _say(self, label: str, done: str, planned: str) -> None:
        self.stdout.write(f"{label}: {done if self.apply else planned}")

    def _split_brand(self, brand: Brand) -> bool:
        products = Product.objects.filter(brand=brand)
        used = set(products.values_list(PRODUCT_KIND, flat=True))
        if not used - {brand.kind}:
            return False
        label = f"Brand {brand.name!r}"
        away = _other(brand.kind)
        moving = products.filter(**{PRODUCT_KIND: away})
        twin = Brand.objects.filter(name=brand.name, kind=away).exclude(pk=brand.pk).first()
        if twin is None and used == {away}:
            self._say(label, f"kind set to {away}", f"would set kind to {away}")
            if self.apply:
                Brand.objects.filter(pk=brand.pk).update(kind=away)
            return True
        count = moving.count()
        source = "the existing" if twin else "a new"
        self._say(
            label,
            f"{count} {away} product(s) moved to {source} {away} brand of the same name",
            f"would move {count} {away} product(s) to {source} {away} brand of the same name",
        )
        if self.apply:
            twin = twin or self._copy_brand(brand, away)
            moving.update(brand=twin)
        return True

    def _copy_brand(self, brand: Brand, kind: str) -> Brand:
        return Brand.objects.create(
            name=brand.name,
            kind=kind,
            slug=unique_slug_for(model=Brand, text=brand.name),
            description=brand.description,
            image=brand.image.name or None,
            is_active=brand.is_active,
            deleted_at=brand.deleted_at,
        )

    def _split_supplier(self, supplier: Supplier) -> bool:
        orders = filter_by_kind(PurchaseOrder.objects.filter(supplier=supplier), None)
        bills = filter_by_kind(
            VendorBill.objects.filter(supplier=supplier),
            None,
            purchase_order_field="purchase_order_id",
        )
        used = set(orders.values_list("kind", flat=True)) | set(
            bills.values_list("kind", flat=True)
        )
        if not used - {supplier.kind}:
            return False
        label = f"Supplier {supplier.name!r}"
        away = _other(supplier.kind)
        if used == {away}:
            self._say(label, f"kind set to {away}", f"would set kind to {away}")
            if self.apply:
                Supplier.objects.filter(pk=supplier.pk).update(kind=away)
            return True
        order_ids = list(orders.filter(kind=away).values_list("pk", flat=True))
        bill_ids = list(bills.filter(kind=away).values_list("pk", flat=True))
        twin = (
            Supplier.objects.filter(
                name=supplier.name, contact_email=supplier.contact_email, kind=away
            )
            .exclude(pk=supplier.pk)
            .first()
        )
        source = "the existing" if twin else "a new"
        moved = f"{len(order_ids)} {away} purchase order(s) and {len(bill_ids)} bill(s)"
        self._say(
            label,
            f"{moved} moved to {source} {away} supplier of the same name",
            f"would move {moved} to {source} {away} supplier of the same name",
        )
        if self.apply:
            twin = twin or Supplier.objects.create(
                name=supplier.name,
                kind=away,
                contact_email=supplier.contact_email,
                phone=supplier.phone,
                payment_terms=supplier.payment_terms,
                is_active=supplier.is_active,
                deleted_at=supplier.deleted_at,
            )
            PurchaseOrder.objects.filter(pk__in=order_ids).update(supplier=twin)
            VendorBill.objects.filter(pk__in=bill_ids).update(supplier=twin)
        return True
