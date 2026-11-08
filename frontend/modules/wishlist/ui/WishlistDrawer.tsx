"use client";

import Link from "next/link";
import { Heart, ShoppingCart } from "lucide-react";
import { useWishlist } from "../context";
import { useCart } from "@/modules/cart";
import { useLang } from "@/lib/i18n";
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

export function WishlistDrawer() {
  const { items, isWishlistOpen, closeWishlist, removeItem, clearWishlist } = useWishlist();
  const { addItem } = useCart();
  const { t, ui, money } = useLang();

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
          <section className="space-y-3">
            {items.map((item) => (
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
        )}
      </DrawerBody>

      {items.length > 0 && (
        // The move-all button sits in the footer, fixed below the scrolling list.
        <DrawerFooter backLabel={ui("backToShopping")} onBack={closeWishlist}>
          <Button
            size="sm"
            fullWidth
            onClick={() => items.forEach((item) => addItem(item))}
            leadingIcon={<ShoppingCart className="h-4 w-4" />}
          >
            {ui("wishlistMoveAllToCart")}
          </Button>
        </DrawerFooter>
      )}
    </Drawer>
  );
}
