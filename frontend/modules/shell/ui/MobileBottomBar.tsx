"use client";

import React, { Suspense, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SLIDE_EASE } from "@/design-system/patterns/usePresence";
import { CountBadge } from "@/design-system/ui/CountBadge";
import { Home, Truck, Heart, User } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { UserAvatar, firstName, useAuth } from "@/modules/auth";
import { useBrand } from "@/modules/catalog";
import { FacebookIcon } from "@/design-system/icons/BrandIcons";
import { useWishlist } from "@/modules/wishlist";
import { WithShopCounts } from "./WithShopCounts";

/**
 * Top edge of the bar's middle piece (110 x 40): it curves down into a dip that holds the 46px Facebook button with
 * a gap around it, and back up, with rounded shoulders where the dip meets the flat edge.
 */
const NOTCH_PATH = "M0 0H15C24 0 26 5 29 13C33 25 44 31 55 31C66 31 77 25 81 13C84 5 86 0 95 0H110V40H0Z";

function MobileBottomBarInner({ wishlistCount }: { wishlistCount: number }) {
  const pathname = usePathname();
  const { ui, n } = useLang();
  const { openWishlist, isWishlistOpen } = useWishlist();
  const { user } = useAuth();
  const brand = useBrand();

  // Active tab index (-1 = none: the shop, product and pre-order pages have no tab of their own):
  // 0 = Home, 1 = Track Order, 2 = Facebook (a link out, never active), 3 = Wishlist, 4 = Profile
  const activeIndex = useMemo(() => {
    if (isWishlistOpen) return 3;
    if (pathname.startsWith("/login")) return 4;
    if (pathname.startsWith("/track-order")) return 1;
    if (pathname.startsWith("/pre-order")) return -1;
    if (pathname.startsWith("/shop") || pathname.startsWith("/product")) return -1;
    return 0; // Default to Home
  }, [pathname, isWishlistOpen]);

  // Checkout has its own submit button at the bottom of the form; the bar would sit on top of it.
  if (pathname.startsWith("/checkout")) return null;

  const tabs = [
    {
      id: "home",
      label: ui("navHome"),
      href: "/",
      external: false,
      icon: Home,
      badge: 0,
      onClick: undefined,
    },
    {
      id: "track",
      label: ui("tabTrack"),
      href: "/track-order",
      external: false,
      icon: Truck,
      badge: 0,
      onClick: undefined,
    },
    {
      // The shop's Facebook page, opened in a new tab.
      id: "facebook",
      label: ui("shareFacebook"),
      href: brand.facebook,
      external: true,
      icon: FacebookIcon,
      badge: 0,
      onClick: undefined,
    },
    {
      id: "wishlist",
      label: ui("navWishlist"),
      href: undefined,
      external: false,
      icon: Heart,
      badge: wishlistCount,
      onClick: openWishlist,
    },
    {
      id: "profile",
      // Logged in: the tab shows the customer's avatar and first name instead of the generic icon and "Profile".
      label: (user && firstName(user)) || ui("navProfile"),
      href: "/login",
      external: false,
      icon: User,
      badge: 0,
      onClick: undefined,
    },
  ];

  return (
    <nav aria-label={ui("bottomNav")} className="fixed inset-x-0 bottom-0 z-40 block w-full lg:hidden">
      <div className="relative w-full pb-[env(safe-area-inset-bottom,0px)]">
        {/* The bar itself: its top edge dips in the middle, bending around the floating Facebook button. */}
        <div aria-hidden="true" className="absolute inset-0 drop-shadow-[0_-2px_6px_rgba(0,0,0,0.18)]">
          <div className="flex h-full w-full text-brand-800">
            <div className="flex-1 bg-current" />
            <div className="-mx-px flex w-[110px] shrink-0 flex-col">
              <svg viewBox="0 0 110 40" className="block h-10 w-full" fill="currentColor">
                <path d={NOTCH_PATH} />
              </svg>
              <div className="-mt-px flex-1 bg-current" />
            </div>
            <div className="flex-1 bg-current" />
          </div>
        </div>
        {/* Navigation row with moving spotlight */}
        <div className="relative flex h-[60px] w-full items-center">
          {/* Smooth moving spotlight beam & top glowing indicator (5 tabs -> w-1/5) */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute bottom-0 left-0 top-0 flex w-1/5 flex-col items-center justify-start overflow-hidden transition-[transform,opacity] duration-300 ${SLIDE_EASE}`}
            style={{ transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`, opacity: activeIndex === -1 ? 0 : 1 }}
          >
            {/* Top glowing bar flush with top border */}
            <div className="h-[3.5px] w-10 rounded-full bg-gradient-to-r from-gold-500 via-gold-400 to-gold-500 shadow-md shadow-gold-500/60" />

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
                  {tab.id === "profile" && user ? (
                    <UserAvatar user={user} className="h-6 w-6 text-2xs" />
                  ) : (
                    <Icon
                      aria-hidden="true"
                      className={`h-5 w-5 transition-colors duration-200 ${
                        isActive ? "text-gold-300 drop-shadow-sm drop-shadow-gold-500/35" : "text-white/70"
                      } ${
                        tab.id === "wishlist" && isActive
                          ? "fill-gold-300"
                          : tab.id === "wishlist" && tab.badge > 0
                            ? "fill-gold-300/30 text-gold-300"
                            : ""
                      }`}
                    />
                  )}

                  {tab.badge > 0 && <CountBadge className="-right-2 -top-1.5">{n(tab.badge)}</CountBadge>}
                </span>
                <span
                  className={`max-w-full truncate px-0.5 text-2xs font-semibold leading-none transition-colors ${
                    isActive ? "text-gold-300" : "text-white/75 group-hover:text-white"
                  }`}
                >
                  {tab.label}
                </span>
              </>
            );

            const tabClass =
              "group relative z-10 flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 active:scale-95";

            if (tab.href && tab.external) {
              return (
                <a
                  key={tab.id}
                  href={tab.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={ui("facebookLink")}
                  className="group relative z-10 flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end pb-[12.5px]"
                >
                  {/* Floats half above the bar, inside the dip */}
                  <span className="absolute left-1/2 top-0 flex h-[46px] w-[46px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-black/25 transition-transform duration-200 ease-out group-hover:scale-105 group-active:scale-95">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <span className="max-w-full truncate px-0.5 text-2xs font-semibold leading-none text-white/75 transition-colors group-hover:text-white">
                    {tab.label}
                  </span>
                </a>
              );
            }

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
      <WithShopCounts>{(counts) => <MobileBottomBarInner wishlistCount={counts.wishlist} />}</WithShopCounts>
    </Suspense>
  );
}
