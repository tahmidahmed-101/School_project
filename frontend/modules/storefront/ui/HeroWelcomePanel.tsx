"use client";

import Link from "next/link";
import { ChevronRight, Clock, Gift, Sparkles, Store } from "lucide-react";
import { useLang } from "@/lib/i18n";

const QUICK_LINKS = [
  {
    id: "featured",
    href: "/shop?sort=featured",
    icon: Sparkles,
    titleKey: "heroFeaturedTitle",
    subtitleKey: "heroFeaturedSubtitle",
    tint: "bg-gold-50",
    iconTint: "bg-accent text-white",
  },
  {
    id: "preorder",
    href: "/pre-order",
    icon: Clock,
    titleKey: "heroPreorderTitle",
    subtitleKey: "heroPreorderSubtitle",
    tint: "bg-brand-50",
    iconTint: "bg-brand-600 text-white",
  },
  {
    id: "promotion",
    href: "/shop?sort=discount",
    icon: Gift,
    titleKey: "heroPromotionTitle",
    subtitleKey: "heroPromotionSubtitle",
    tint: "bg-surface",
    iconTint: "bg-ink-900 text-white",
  },
] as const;

/** Welcome card + quick-link stack shown on the right of the hero on desktop. */
export function HeroWelcomePanel({ hasOffers }: { hasOffers: boolean }) {
  const { ui } = useLang();
  const links = hasOffers ? QUICK_LINKS : QUICK_LINKS.filter((link) => link.id !== "promotion");

  return (
    <div className="flex h-full flex-col gap-2.5 sm:gap-3">
      <div className="flex flex-col items-center gap-2.5 rounded-2xl bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-3.5 text-center shadow-md sm:rounded-3xl sm:p-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-sm">
          <Store className="h-4 w-4 text-brand-700" />
        </span>
        <div>
          <h2 className="ts-display text-sm font-extrabold leading-tight text-white">{ui("heroWelcomeTitle")}</h2>
          <p className="mt-0.5 line-clamp-1 text-2xs text-white/70">{ui("heroWelcomeSubtitle")}</p>
        </div>
        <div className="flex w-full flex-col gap-1.5">
          <Link
            href="/login"
            className="flex items-center justify-center rounded-full bg-gold-400 px-3 py-2 text-2xs font-bold text-ink-950 shadow-sm transition-all duration-200 hover:scale-[1.02] hover:bg-gold-300 active:scale-[0.98]"
          >
            {ui("loginTitle")}
          </Link>
          <Link
            href="/register"
            className="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-white/10 px-3 py-2 text-2xs font-bold text-white ring-1 ring-inset ring-white/30 transition-all duration-200 hover:bg-white/20"
          >
            {ui("registerTitle")}
          </Link>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {links.map(({ id, href, icon: Icon, titleKey, subtitleKey, tint, iconTint }) => (
          <Link
            key={id}
            href={href}
            className={`group flex flex-1 items-center gap-2 rounded-xl ${tint} p-2.5 shadow-sm transition-all duration-200 hover:shadow-md sm:rounded-2xl sm:p-3`}
          >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconTint}`}>
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-2xs font-bold text-ink-950 sm:text-xs">{ui(titleKey)}</span>
              <span className="block truncate text-2xs text-fg-subtle">{ui(subtitleKey)}</span>
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-fg-muted" />
          </Link>
        ))}
      </div>
    </div>
  );
}
