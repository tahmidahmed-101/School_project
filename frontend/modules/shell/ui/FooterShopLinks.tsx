"use client";

import Link from "next/link";
import type { CategoryInfo } from "@/lib/types";
import type { UiKey } from "@/lib/i18n";
import { useLang } from "@/lib/i18n";
import { shopListing } from "@/lib/product";
import { categoryGroups } from "@/modules/catalog";

interface FooterShopLinksProps {
  categories: CategoryInfo[];
  /** The shipping policy has no built-in copy, so its link shows only once staff publish one. */
  hasShippingPolicy: boolean;
}

const SHOP_LINKS: { href: string; label: UiKey }[] = [
  { href: "/", label: "navHome" },
  { href: "/shop", label: "navShop" },
];

const linkClass = "transition-colors hover:text-gold-300";

/** The footer's Categories and Quick links columns. */
export function FooterShopLinks({ categories, hasShippingPolicy }: FooterShopLinksProps) {
  const { t, ui } = useLang();
  // Main categories only: their subcategories are one click away in the shop.
  const groups = categoryGroups(categories);

  return (
    <>
      {/* Col 2: Categories (3 cols) */}
      <div className="space-y-3 lg:col-span-3">
        <h4 className="text-xs font-bold uppercase tracking-wide text-white">{ui("footerCategories")}</h4>
        <ul className="space-y-2">
          {groups.map(({ main: cat }) => (
            <li key={cat.id}>
              <Link href={shopListing({ category: cat.slug })} prefetch={false} className={linkClass}>
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
          {SHOP_LINKS.map(({ href, label }) => (
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
