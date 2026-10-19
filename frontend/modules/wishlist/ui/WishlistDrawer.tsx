"use client";

import Link from "next/link";
import { Heart, ShoppingCart } from "lucide-react";
import { useWishlist } from "../context";
import { useCart } from "@/modules/cart";
import { useLang } from "@/lib/i18n";
import { splitByKind, productKind } from "@/lib/product";
import { soleVariant } from "@/lib/variants";
import {
  Drawer,
  DrawerBody,
  DrawerEmpty,
  DrawerFooter,
  DrawerItem,
  DrawerItemImage,
  DrawerRemoveButton,
} from "@/design-system/ui/Drawer";
import { Button, buttonClass } from "@/design-system/ui/Button";

const SECTIONS = [
  { kind: "stock", titleKey: "kindStockItems", moveAllKey: "wishlistMoveStockToCart" },
  { kind: "preorder", titleKey: "kindPreorderItems", moveAllKey: "wishlistMovePreorderToCart" },
] as const;

export function WishlistDrawer() {
  const { items, isWishlistOpen, closeWishlist, removeItem, clearWishlist } = useWishlist();
  const { addItem } = useCart();
  const { t, ui, money, n } = useLang();
  const byKind = splitByKind(items, productKind);
  const sections = SECTIONS.filter((section) => byKind[section.kind].length > 0);

  return (
    <Drawer
      open={isWishlistOpen}
      onClose={closeWishlist}
      label={ui("wishlistTitle")}
      closeLabel="Close wishlist drawer"
      icon={<Heart className="h-5 w-5 text-gold-700" />}
      title={ui("wishlistTitle")}
      actions={
        items.length > 0 && (
          <button
            type="button"
            onClick={clearWishlist}
            className="cursor-pointer px-2 py-1 text-xs font-medium text-fg-subtle transition-colors hover:text-danger"
          >
            {ui("wishlistClear")}
          </button>
        )
      }
    >
      <DrawerBody>
        {items.length === 0 ? (
          <DrawerEmpty
            icon={<Heart className="h-8 w-8" />}
            title={ui("wishlistEmptyTitle")}
            subtitle={ui("wishlistEmptySubtitle")}
            actionLabel={ui("cartStartShopping")}
            onAction={closeWishlist}
          />
        ) : (
          sections.map((section) => (
            <section key={section.kind} className="space-y-3">
              <h3 className="text-2xs font-bold uppercase tracking-wider text-fg-muted">
                {ui(section.titleKey)} ({n(byKind[section.kind].length)})
              </h3>
              {byKind[section.kind].map((item) => (
                <DrawerItem key={item.id}>
                  <DrawerItemImage src={item.image} alt={t(item.name)} />

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-2xs font-medium text-fg-subtle">{t(item.categoryName)}</div>
                    <Link
                      href={`/product/${item.slug}`}
                      onClick={closeWishlist}
                      className="block truncate text-xs font-bold text-fg transition-colors hover:text-gold-800"
                    >
                      {t(item.name)}
                    </Link>
                    <div className="text-xs font-bold text-gold-800">{money(item.price)}</div>

                    <div className="flex items-center gap-2 pt-1">
                      {soleVariant(item) ? (
                        <Button
                          size="xs"
                          onClick={() => addItem(item)}
                          leadingIcon={<ShoppingCart className="h-3.5 w-3.5" />}
                        >
                          {ui("wishlistMoveToCart")}
                        </Button>
                      ) : (
                        <Link
                          href={`/product/${item.slug}`}
                          onClick={closeWishlist}
                          className={buttonClass({ size: "xs" })}
                        >
                          {ui("chooseOptions")}
                        </Link>
                      )}

                      <DrawerRemoveButton label={ui("cartRemove")} onClick={() => removeItem(item.id)} />
                    </div>
                  </div>
                </DrawerItem>
              ))}
            </section>
          ))
        )}
      </DrawerBody>

      {items.length > 0 && (
        // The move-all buttons sit in the footer, fixed below the scrolling list.
        <DrawerFooter backLabel={ui("backToShopping")} onBack={closeWishlist}>
          {sections.map((section) => (
            <Button
              key={section.kind}
              size="sm"
              fullWidth
              onClick={() => byKind[section.kind].forEach((item) => addItem(item))}
              leadingIcon={<ShoppingCart className="h-4 w-4" />}
            >
              {ui(section.moveAllKey)}
            </Button>
          ))}
        </DrawerFooter>
      )}
    </Drawer>
  );
}
