"use client";

import Link from "next/link";
import { Trash2, Heart, ShoppingCart, ArrowRight } from "lucide-react";
import { useWishlist } from "../context";
import { useCart } from "@/modules/cart";
import { useLang } from "@/lib/i18n";
import { Drawer, DrawerBody, DrawerEmpty, DrawerItemImage } from "@/design-system/ui/Drawer";
import { Button, buttonClass } from "@/design-system/ui/Button";

export function WishlistDrawer() {
  const { items, isWishlistOpen, closeWishlist, removeItem, clearWishlist, totalWishlistItems } = useWishlist();
  const { addItem } = useCart();
  const { t, ui, money, n } = useLang();

  return (
    <Drawer
      open={isWishlistOpen}
      onClose={closeWishlist}
      label={ui("wishlistTitle")}
      closeLabel="Close wishlist drawer"
      icon={<Heart className="h-5 w-5 fill-red-500 text-red-500" />}
      title={
        <>
          {ui("wishlistTitle")} ({n(totalWishlistItems)})
        </>
      }
      actions={
        items.length > 0 && (
          <button
            type="button"
            onClick={clearWishlist}
            className="cursor-pointer px-2 py-1 text-xs font-medium text-ink-500 transition-colors hover:text-red-600"
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
            iconWrapClassName="bg-red-50 text-red-400"
            title={ui("wishlistEmptyTitle")}
            subtitle={ui("wishlistEmptySubtitle")}
            subtitleClassName="max-w-xs"
            actionLabel={ui("cartStartShopping")}
            onAction={closeWishlist}
          />
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-xl border border-ink-200/80 bg-ink-50 p-3">
              <DrawerItemImage src={item.image} alt={t(item.name)} />

              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-[11px] font-medium text-ink-500">{t(item.categoryName)}</div>
                <Link
                  href={`/product/${item.slug}`}
                  onClick={closeWishlist}
                  className="block truncate text-xs font-bold text-ink-900 transition-colors hover:text-gold-800"
                >
                  {t(item.name)}
                </Link>
                <div className="text-xs font-bold text-gold-800">{money(item.price)}</div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => addItem(item)}
                    className="shadow-xs inline-flex cursor-pointer items-center gap-1 rounded-full bg-gold-500 px-2.5 py-1 text-[11px] font-bold text-ink-950 transition-all hover:bg-gold-400"
                  >
                    <ShoppingCart className="h-3 w-3" />
                    <span>{ui("wishlistMoveToCart")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="ml-auto cursor-pointer p-1 text-ink-400 transition-colors hover:text-red-600"
                    aria-label="Remove from wishlist"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </DrawerBody>

      {items.length > 0 && (
        <div className="space-y-3 border-t border-ink-200 pt-4">
          <Button
            size="lg"
            fullWidth
            onClick={() => items.forEach((item) => addItem(item))}
            leadingIcon={<ShoppingCart className="h-4 w-4" />}
          >
            Move all to cart
          </Button>
          <Link href="/shop" onClick={closeWishlist} className={buttonClass({ variant: "outline", fullWidth: true })}>
            <span>Continue browsing</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </Drawer>
  );
}
