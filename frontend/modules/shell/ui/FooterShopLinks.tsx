"use client";

import Link from "next/link";
import type { CategoryInfo } from "@/lib/types";
import type { UiKey } from "@/lib/i18n";
import { useLang } from "@/lib/i18n";
import { shopListing, type ProductKind } from "@/lib/product";
import { categoryGroups, WithPageKind } from "@/modules/catalog";
import { useCart } from "@/modules/cart";

interface FooterShopLinksProps {
  /** Both shops' categories; the visitor's shop picks its own. */
  categories: CategoryInfo[];
  /** The shipping policy has no built-in copy, so its link shows only once staff publish one. */
  hasShippingPolicy: boolean;
}

/** Ready stock is the home page, so the stock shop's links are Home and Shop; the pre-order shop has its own page. */
const SHOP_LINKS: Record<ProductKind, { href: string; label: UiKey }[]> = {
  stock: [
    { href: "/", label: "navHome" },
    { href: "/shop", label: "navShop" },
  ],
  preorder: [{ href: "/pre-order", label: "navPreOrder" }],
};

const linkClass = "transition-colors hover:text-gold-300";

/**
 * The footer's Categories and Quick links columns for the shop the visitor is in: a stock page lists stock categories
 * and stock links only, a pre-order page pre-order ones only.
 */
export function FooterShopLinks(props: FooterShopLinksProps) {
  const { kind: basket } = useCart();
  return <WithPageKind basket={basket}>{(kind) => <ShopLinks {...props} kind={kind} />}</WithPageKind>;
}

function ShopLinks({ categories, hasShippingPolicy, kind }: FooterShopLinksProps & { kind: ProductKind }) {
  const { t, ui } = useLang();
  // Main categories only: their subcategories are one click away in the shop.
  const groups = categoryGroups(categories.filter((category) => category.type === kind));

  return (
    <>
      {/* Col 2: Categories (3 cols) */}
      <div className="space-y-3 lg:col-span-3">
        <h4 className="text-xs font-bold uppercase tracking-wide text-white">{ui("footerCategories")}</h4>
        <ul className="space-y-2">
          {groups.map(({ main: cat }) => (
            <li key={cat.id}>
              <Link href={shopListing(kind, { category: cat.slug })} prefetch={false} className={linkClass}>
                {t(cat.name)}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Col 3: Quick links (2 cols) */}
      <div className="space-y-3 lg:col-span-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-white">{ui("footerQuickLinks")}</h4>
        <ul className="space-y-2">
          {SHOP_LINKS[kind].map(({ href, label }) => (
            <li key={href}>
              <Link href={href} className={linkClass}>
                {ui(label)}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/checkout" className={linkClass}>
              {ui("checkoutTitle")}
            </Link>
          </li>
          <li>
            <Link href="/track-order" className={linkClass}>
              {ui("navTrackOrder")}
            </Link>
          </li>
          <li>
            <Link href="/return-policy" className={linkClass}>
              {ui("footerReturnPolicy")}
            </Link>
          </li>
          <li>
            <Link href="/refund-policy" className={linkClass}>
              {ui("footerRefundPolicy")}
            </Link>
          </li>
          {hasShippingPolicy && (
            <li>
              <Link href="/shipping-policy" className={linkClass}>
                {ui("footerShippingPolicy")}
              </Link>
            </li>
          )}
        </ul>
      </div>
    </>
  );
}
