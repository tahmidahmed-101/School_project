"use client";

import React, { Suspense, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SLIDE_EASE } from "@/design-system/patterns/usePresence";
import { CountBadge } from "@/design-system/ui/CountBadge";
import { Home, Store, Truck, Heart, User } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useWishlist } from "@/modules/wishlist";

function MobileBottomBarInner() {
  const pathname = usePathname();
  const { ui, n } = useLang();
  const { openWishlist, isWishlistOpen, totalWishlistItems } = useWishlist();

  // Active tab index (-1 = none, e.g. on the pre-order page which has its own nav entry):
  // 0 = Home, 1 = Shop, 2 = Track Order, 3 = Wishlist, 4 = Profile
  const activeIndex = useMemo(() => {
    if (isWishlistOpen) return 3;
    if (pathname.startsWith("/login")) return 4;
    if (pathname.startsWith("/track-order")) return 2;
    if (pathname.startsWith("/pre-order")) return -1;
    if (pathname.startsWith("/shop") || pathname.startsWith("/product")) {
      return 1;
    }
    return 0; // Default to Home
  }, [pathname, isWishlistOpen]);

  // Checkout has its own submit button at the bottom of the form; the bar would sit on top of it.
  if (pathname.startsWith("/checkout")) return null;

  const tabs = [
    {
      id: "home",
      label: ui("navHome"),
      href: "/",
      icon: Home,
      badge: 0,
      onClick: undefined,
    },
    {
      id: "shop",
      label: ui("tabShop"),
      href: "/shop",
      icon: Store,
      badge: 0,
      onClick: undefined,
    },
    {
      id: "track",
      label: ui("tabTrack"),
      href: "/track-order",
      icon: Truck,
      badge: 0,
      onClick: undefined,
    },
    {
      id: "wishlist",
      label: ui("navWishlist"),
      href: undefined,
      icon: Heart,
      badge: totalWishlistItems,
      onClick: openWishlist,
    },
    {
      id: "profile",
      label: ui("navProfile"),
      href: "/login",
      icon: User,
      badge: 0,
      onClick: undefined,
    },
  ];

  return (
    <nav aria-label={ui("bottomNav")} className="fixed inset-x-0 bottom-0 z-40 block w-full lg:hidden">
      <div className="relative w-full border-t border-brand-900 bg-brand-800 shadow-[0_-4px_24px_rgba(0,0,0,0.18)] pb-[env(safe-area-inset-bottom,0px)]">
        {/* Navigation row with moving spotlight */}
        <div className="relative flex h-[60px] w-full items-center">
          {/* Smooth moving spotlight beam & top glowing indicator (5 tabs -> w-1/5) */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute bottom-0 left-0 top-0 flex w-1/5 flex-col items-center justify-start overflow-hidden transition-[transform,opacity] duration-300 ${SLIDE_EASE}`}
            style={{ transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`, opacity: activeIndex === -1 ? 0 : 1 }}
          >
            {/* Top glowing bar flush with top border */}
            <div className="h-[3.5px] w-10 rounded-full bg-gradient-to-r from-gold-500 via-gold-400 to-gold-500 shadow-[0_0_10px_rgba(229,192,76,0.7),0_0_20px_rgba(229,192,76,0.35)]" />

            {/* Downward light beam container */}
            <div className="relative flex h-full w-full items-center justify-center">
              {/* Ambient radial atmospheric warm glow */}
              <div className="pointer-events-none absolute -top-1 h-14 w-28 bg-[radial-gradient(ellipse_75%_80%_at_50%_0%,rgba(229,192,76,0.22)_0%,rgba(229,192,76,0.05)_50%,transparent_78%)]" />

              {/* Direct trapezoidal spotlight cone */}
              <div
                className="pointer-events-none h-full w-[68px] bg-gradient-to-b from-gold-500/24 via-gold-500/7 to-transparent blur-[1.5px]"
                style={{
                  clipPath: "polygon(22% 0%, 78% 0%, 100% 100%, 0% 100%)",
                }}
              />
            </div>
          </div>

          {tabs.map((tab, idx) => {
            const Icon = tab.icon;
            const isActive = activeIndex === idx;

            const content = (
              <>
                <span
                  className={`relative flex items-center justify-center transition-transform duration-200 ease-out ${
                    isActive ? "-translate-y-px scale-[1.08]" : ""
                  }`}
                >
                  <Icon
                    aria-hidden="true"
                    className={`h-5 w-5 transition-colors duration-200 ${
                      isActive ? "text-gold-300 drop-shadow-[0_1px_4px_rgba(229,192,76,0.35)]" : "text-white/70"
                    } ${
                      tab.id === "wishlist" && isActive
                        ? "fill-gold-300"
                        : tab.id === "wishlist" && tab.badge > 0
                          ? "fill-gold-300/30 text-gold-300"
                          : ""
                    }`}
                  />

                  {tab.badge > 0 && <CountBadge className="-right-2 -top-1.5">{n(tab.badge)}</CountBadge>}
                </span>
                <span
                  className={`max-w-full truncate px-0.5 text-[10px] font-semibold leading-none transition-colors ${
                    isActive ? "text-gold-300" : "text-white/75 group-hover:text-white"
                  }`}
                >
                  {tab.label}
                </span>
              </>
            );

            const tabClass =
              "group relative z-10 flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 active:scale-95";

            if (tab.href) {
              return (
                <Link key={tab.id} href={tab.href} aria-current={isActive ? "page" : undefined} className={tabClass}>
                  {content}
                </Link>
              );
            }

            return (
              <button key={tab.id} type="button" onClick={tab.onClick} aria-pressed={isActive} className={tabClass}>
                {content}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export function MobileBottomBar() {
  return (
    <Suspense fallback={null}>
      <MobileBottomBarInner />
    </Suspense>
  );
}
