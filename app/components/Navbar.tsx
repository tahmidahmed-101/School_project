"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, Heart, Globe, Phone, MapPin, Clock } from "lucide-react";
import { BRAND_INFO } from "../lib/data";
import { useLang } from "../lib/i18n";
import { useCart } from "../lib/cart";
import { useWishlist } from "../lib/wishlist";
import { photo } from "../lib/photo";
import type { T } from "../lib/types";
import { NavbarSearch } from "./NavbarSearch";
import { NavCategoriesMenu } from "./NavCategoriesMenu";
import { WithActiveCategory } from "./WithActiveCategory";

const SHOP_PATH = "/shop";

interface NavLink {
  label: T;
  href: string;
  isActive: boolean;
}

function buildNavLinks(pathname: string, activeCategory: string | null): NavLink[] {
  const onShop = pathname === SHOP_PATH;
  return [
    { label: { en: "Home", bn: "হোম" }, href: "/", isActive: pathname === "/" },
    { label: { en: "Shop All", bn: "সব পণ্য" }, href: SHOP_PATH, isActive: onShop && !activeCategory },
    {
      label: { en: "Pre-order", bn: "প্রি-অর্ডার" },
      href: "/pre-order",
      isActive: pathname.startsWith("/pre-order"),
    },
    {
      label: { en: "Gadgets", bn: "গ্যাজেটস" },
      href: `${SHOP_PATH}?category=gadgets`,
      isActive: onShop && activeCategory === "gadgets",
    },
    {
      label: { en: "Women's", bn: "নারীদের" },
      href: `${SHOP_PATH}?category=womens-fashion`,
      isActive: onShop && activeCategory === "womens-fashion",
    },
    {
      label: { en: "Bags", bn: "ব্যাগ" },
      href: `${SHOP_PATH}?category=bags-wallets`,
      isActive: onShop && activeCategory === "bags-wallets",
    },
    {
      label: { en: "Kids", bn: "কিডস" },
      href: `${SHOP_PATH}?category=kids`,
      isActive: onShop && activeCategory === "kids",
    },
  ];
}

export function Navbar() {
  const pathname = usePathname();

  const { lang, setLang, t, ui, n } = useLang();
  const { totalItems, openDrawer } = useCart();
  const { totalWishlistItems, openWishlist } = useWishlist();

  // Sticky shadow once the page has scrolled
  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 30);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 w-full bg-brand-800 transition-all duration-300 ${
        isScrolled ? "shadow-md" : "border-b border-brand-900"
      }`}
    >
      {/* Tier 1: logo, live search, language / wishlist / cart */}
      <div className="border-b border-white/10 lg:border-b-0">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:gap-6 sm:px-6 sm:py-3.5 lg:gap-8 lg:px-8">
          <div className="flex shrink-0 items-center">
            <Link href="/" className="group flex items-center gap-2 sm:gap-2.5">
              <Image
                src={photo(BRAND_INFO.logoCart)}
                alt={BRAND_INFO.name}
                width={382}
                height={282}
                priority
                className="h-6 w-auto shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)] transition-transform duration-300 group-hover:scale-105 sm:h-10"
              />
              <span className="text-sm font-extrabold tracking-[0.12em] text-white transition-colors group-hover:text-gold-300 sm:text-lg lg:text-xl">
                {lang === "bn" ? "কুল মার্ট" : "KULL MART"}
              </span>
            </Link>
          </div>

          <NavbarSearch />

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            {/* Mobile only; on desktop Pre-order already lives in the Tier 2 nav links */}
            <Link
              href="/pre-order"
              aria-label={ui("navPreOrder")}
              className={`relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors lg:hidden ${
                pathname.startsWith("/pre-order")
                  ? "text-gold-300"
                  : "text-white hover:bg-white/10 hover:text-gold-300"
              }`}
            >
              <Clock className="h-5 w-5" />
            </Link>

            <button
              type="button"
              onClick={() => setLang(lang === "en" ? "bn" : "en")}
              className="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20 sm:px-3"
              aria-label="Switch language between English and Bangla"
            >
              <Globe className="h-3.5 w-3.5 text-gold-300" />
              <span>{lang === "en" ? "বাংলা" : "EN"}</span>
            </button>

            {/* Desktop only; on mobile the wishlist lives in the bottom bar */}
            <button
              type="button"
              onClick={openWishlist}
              aria-label={ui("navWishlist")}
              className="relative hidden h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10 hover:text-rose-300 lg:flex"
            >
              <Heart
                className={`h-5 w-5 ${totalWishlistItems > 0 ? "fill-rose-400 text-rose-400" : ""}`}
              />
              {totalWishlistItems > 0 && (
                <span className="shadow-xs absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                  {n(totalWishlistItems)}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={openDrawer}
              aria-label="Open cart drawer"
              className="relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10 hover:text-gold-300"
            >
              <ShoppingBag className="h-5 w-5 transition-transform hover:scale-105" />
              {totalItems > 0 && (
                <span className="shadow-xs absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-bold text-ink-950">
                  {n(totalItems)}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tier 2 (desktop): categories menu, nav links, address and hotline */}
      <div className="shadow-2xs hidden border-t border-white/10 bg-brand-900 text-white lg:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6 py-2">
            <NavCategoriesMenu />

            <nav className="flex items-center gap-6 text-sm font-medium">
              <WithActiveCategory>
                {(activeCategory) =>
                  buildNavLinks(pathname, activeCategory).map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`inline-flex items-center gap-1.5 py-2 transition-colors ${
                        link.isActive
                          ? "font-bold text-gold-300"
                          : "text-white/80 hover:text-gold-300"
                      }`}
                    >
                      <span>{t(link.label)}</span>
                    </Link>
                  ))
                }
              </WithActiveCategory>
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2.5 border-l border-white/15 py-1 pl-4 xl:gap-3.5">
            <div className="flex items-center gap-1.5" title={t(BRAND_INFO.address)}>
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-gold-300">
                <MapPin className="h-3 w-3" />
              </div>
              <span className="whitespace-nowrap text-[11px] font-medium text-white/85">
                {lang === "bn" ? "ঢাকা, বাংলাদেশ" : "Dhaka, Bangladesh"}
              </span>
            </div>

            <span className="h-3.5 w-px bg-white/20" aria-hidden="true" />

            <div className="flex items-center gap-1.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold-400/40 bg-gold-500/15 text-gold-300">
                <Phone className="h-3 w-3" />
              </div>
              <a
                href={`tel:${BRAND_INFO.phone}`}
                className="whitespace-nowrap text-xs font-bold text-white transition-colors hover:text-gold-300"
              >
                {BRAND_INFO.phone}
              </a>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
