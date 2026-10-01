"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, Home, Store, Globe, Truck, Sparkles } from "lucide-react";
import { useCatalog } from "@/modules/catalog";
import { useLang } from "@/lib/i18n";
import { useOverlay } from "@/lib/useOverlay";
import { WithActiveCategory } from "@/modules/catalog";
import { SLIDE_EASE, usePresence } from "@/design-system/patterns/usePresence";

const SHOP_PATH = "/shop";

const POLICY_LINKS = [
  { href: "/return-policy", key: "footerReturnPolicy" },
  { href: "/refund-policy", key: "footerRefundPolicy" },
] as const;

interface MobileNavMenuProps {
  open: boolean;
  onClose: () => void;
}

/** Left-hand slide-in menu with Home / Shop / categories and the language toggle, mobile only. */
export function MobileNavMenu({ open, onClose }: MobileNavMenuProps) {
  const pathname = usePathname();
  const { lang, setLang, t, ui } = useLang();
  const { categories: allCategories } = useCatalog();
  // Pre-order has its own nav link and category rail; this menu covers the regular stock catalogue.
  const categories = allCategories.filter((category) => category.type === "stock");

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
                  className="cursor-pointer rounded-lg bg-white/10 p-1.5 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
                  aria-label={ui("closeMenu")}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="mt-3 flex-1 space-y-1 overflow-y-auto">
                <Link
                  href="/"
                  onClick={onClose}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                    pathname === "/" ? "bg-white/10 text-gold-300" : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Home className="h-4 w-4 shrink-0" />
                  <span>{ui("navHome")}</span>
                </Link>

                <WithActiveCategory>
                  {(activeCategory) => (
                    <>
                      <Link
                        href={SHOP_PATH}
                        onClick={onClose}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                          pathname === SHOP_PATH && !activeCategory
                            ? "bg-white/10 text-gold-300"
                            : "text-white/80 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <Store className="h-4 w-4 shrink-0" />
                        <span>{ui("navShop")}</span>
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

                      <Link
                        href="/pre-order"
                        onClick={onClose}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                          pathname.startsWith("/pre-order")
                            ? "bg-white/10 text-gold-300"
                            : "text-white/80 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <Sparkles className="h-4 w-4 shrink-0" />
                        <span>{ui("navPreOrder")}</span>
                      </Link>

                      <div className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider text-white/40">
                        {ui("shopByCategories")}
                      </div>

                      {categories.map((category) => (
                        <Link
                          key={category.id}
                          href={`${SHOP_PATH}?category=${category.slug}`}
                          onClick={onClose}
                          className={`flex items-center rounded-xl px-3 py-2.5 pl-9 text-sm font-medium transition-colors ${
                            activeCategory === category.slug
                              ? "bg-white/10 font-bold text-gold-300"
                              : "text-white/70 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          <span className="truncate">{t(category.name)}</span>
                        </Link>
                      ))}
                    </>
                  )}
                </WithActiveCategory>

                <ul className="mt-4 space-y-0.5 border-t border-white/10 pt-3">
                  {POLICY_LINKS.map(({ href, key }) => (
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
                  aria-label="Switch language between English and Bangla"
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
