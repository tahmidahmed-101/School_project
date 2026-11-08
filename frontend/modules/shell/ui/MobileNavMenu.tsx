"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, CornerDownRight, X, Store, Globe, Truck } from "lucide-react";
import { categoryGroups, useCatalog } from "@/modules/catalog";
import { shopListing } from "@/lib/product";
import { useLang } from "@/lib/i18n";
import { useOverlay } from "@/lib/useOverlay";
import { WithActiveCategory } from "@/modules/catalog";
import { SLIDE_EASE, usePresence } from "@/design-system/patterns/usePresence";

const SHOP_PATH = "/shop";
// Ready stock is the home page, so its nav link doubles as the Home link.
const READY_STOCK_PATH = "/";

const POLICY_LINKS = [
  { href: "/return-policy", key: "footerReturnPolicy" },
  { href: "/refund-policy", key: "footerRefundPolicy" },
] as const;
const SHIPPING_POLICY_LINK = { href: "/shipping-policy", key: "footerShippingPolicy" } as const;

interface MobileNavMenuProps {
  open: boolean;
  onClose: () => void;
  /** The shipping policy has no built-in copy, so its link shows only once staff publish one. */
  hasShippingPolicy: boolean;
}

/** Left-hand slide-in menu with ready stock, categories and the language toggle, mobile only. */
export function MobileNavMenu({ open, onClose, hasShippingPolicy }: MobileNavMenuProps) {
  const pathname = usePathname();
  const { lang, setLang, t, ui } = useLang();
  const { categories } = useCatalog();
  const groups = categoryGroups(categories);
  const categoryHref = (slug: string) => shopListing({ category: slug });
  // Groups the visitor opened or closed by hand; the group of the category being viewed starts open.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const policyLinks = hasShippingPolicy ? [...POLICY_LINKS, SHIPPING_POLICY_LINK] : POLICY_LINKS;

  useOverlay(open, onClose);

  const { mounted, shown } = usePresence(open, 300);

  return (
    <>
      {mounted && (
        <div className="fixed inset-0 z-50 overflow-hidden lg:hidden">
          <button
            type="button"
            onClick={onClose}
            className={`backdrop-blur-xs fixed inset-0 cursor-default bg-ink-900/50 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`}
            aria-label={ui("closeMenu")}
          />

          <div className="pointer-events-none fixed inset-y-0 left-0 flex h-full w-full max-w-full justify-start">
            <div
              className={`pointer-events-auto z-10 flex h-full w-full max-w-[300px] flex-col border-r border-white/10 bg-brand-800 p-5 shadow-2xl transition-transform duration-300 ${SLIDE_EASE} ${shown ? "translate-x-0" : "-translate-x-full"}`}
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-white">{ui("navMenu")}</h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="cursor-pointer rounded-full bg-white/10 p-1.5 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
                  aria-label={ui("closeMenu")}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="mt-3 flex-1 space-y-1 overflow-y-auto">
                <WithActiveCategory>
                  {(activeCategory) => (
                    <>
                      <Link
                        href={READY_STOCK_PATH}
                        onClick={onClose}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                          pathname === READY_STOCK_PATH || (pathname === SHOP_PATH && !activeCategory)
                            ? "bg-white/10 text-gold-300"
                            : "text-white/80 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <Store className="h-4 w-4 shrink-0" />
                        <span>{ui("navReadyStock")}</span>
                      </Link>

                      <Link
                        href="/track-order"
                        onClick={onClose}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                          pathname === "/track-order"
                            ? "bg-white/10 text-gold-300"
                            : "text-white/80 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <Truck className="h-4 w-4 shrink-0" />
                        <span>{ui("navTrackOrder")}</span>
                      </Link>

                      <div className="px-3 pb-1 pt-4 text-2xs font-bold uppercase tracking-wider text-white/40">
                        {ui("shopByCategories")}
                      </div>

                      {groups.map(({ main, subs }) => {
                        const isOpenGroup =
                          toggled[main.id] ?? subs.some(({ category }) => category.slug === activeCategory);
                        // Only main categories show at first; the arrow opens the subcategories in a box below.
                        return (
                          <div key={main.id}>
                            <div
                              className={`flex items-stretch rounded-xl transition-colors ${
                                activeCategory === main.slug ? "bg-white/10" : "hover:bg-white/10"
                              }`}
                            >
                              <Link
                                href={categoryHref(main.slug)}
                                onClick={onClose}
                                className={`flex min-w-0 flex-1 items-center py-2.5 pl-9 pr-3 text-sm font-semibold ${
                                  activeCategory === main.slug
                                    ? "font-bold text-gold-300"
                                    : "text-white/85 hover:text-white"
                                }`}
                              >
                                <span className="truncate">{t(main.name)}</span>
                              </Link>
                              {subs.length > 0 && (
                                <button
                                  type="button"
                                  aria-expanded={isOpenGroup}
                                  aria-label={`${ui("subcategories")}: ${t(main.name)}`}
                                  onClick={() => setToggled((prev) => ({ ...prev, [main.id]: !isOpenGroup }))}
                                  className="flex w-11 shrink-0 cursor-pointer items-center justify-center text-white/70 hover:text-white"
                                >
                                  <ChevronDown
                                    className={`h-4 w-4 transition-transform duration-200 ${isOpenGroup ? "rotate-180" : ""}`}
                                  />
                                </button>
                              )}
                            </div>
                            {isOpenGroup && (
                              <div className="mb-1.5 ml-9 mt-0.5 rounded-xl bg-white/5 py-1">
                                {subs.map(({ category, depth }) => (
                                  <Link
                                    key={category.id}
                                    href={categoryHref(category.slug)}
                                    onClick={onClose}
                                    style={{ paddingLeft: `${0.75 + (depth - 1) * 0.75}rem` }}
                                    className={`flex items-center gap-2 py-2 pr-3 text-xs transition-colors ${
                                      activeCategory === category.slug
                                        ? "font-bold text-gold-300"
                                        : "font-medium text-white/70 hover:text-white"
                                    }`}
                                  >
                                    <CornerDownRight className="h-3 w-3 shrink-0 text-white/35" />
                                    <span className="truncate">{t(category.name)}</span>
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}
                </WithActiveCategory>

                <ul className="mt-4 space-y-0.5 border-t border-white/10 pt-3">
                  {policyLinks.map(({ href, key }) => (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={onClose}
                        aria-current={pathname === href ? "page" : undefined}
                        className={`block rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                          pathname === href ? "text-gold-300" : "text-white/60 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {ui(key)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>

              <div className="border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={() => setLang(lang === "en" ? "bn" : "en")}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/20"
                  aria-label={ui("switchLanguage")}
                >
                  <Globe className="h-4 w-4 text-gold-300" />
                  <span>{lang === "en" ? "বাংলা" : "English"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
