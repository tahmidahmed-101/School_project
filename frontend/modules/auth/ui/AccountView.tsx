"use client";

import Link from "next/link";
import { Clock, LogOut, Mail, Phone, Store, Truck } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { Breadcrumbs } from "@/design-system/patterns/Breadcrumbs";
import { Button } from "@/design-system/ui/Button";
import { FormAlert } from "@/design-system/ui/FormField";
import { containerClass } from "@/design-system/ui/Container";
import type { AuthUser } from "../context";
import { OrderHistory } from "./OrderHistory";
import { SmsPreference } from "./SmsPreference";
import { UserAvatar } from "./UserAvatar";

/**
 * The logged-in customer's profile page: an identity banner in the brand green, shortcuts to the places they
 * go next, and their order history.
 */
export function AccountView({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const { ui } = useLang();

  const shortcuts = [
    { href: "/shop", label: ui("navReadyStock"), icon: Store },
    { href: "/track-order", label: ui("navTrackOrder"), icon: Truck },
    { href: "/pre-order", label: ui("navPreOrder"), icon: Clock },
  ];

  return (
    <div className="min-h-screen bg-canvas py-8 sm:py-12">
      <div className={containerClass()}>
        <Breadcrumbs className="mb-5" items={[{ label: ui("navProfile") }]} />

        <section className="relative overflow-hidden rounded-3xl bg-brand-800 p-5 text-white shadow-lg sm:p-8">
          {/* Soft gold glow in the corner, the same accent the hero uses. */}
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-gold-400/20 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <UserAvatar user={user} className="h-16 w-16 text-2xl sm:h-20 sm:w-20 sm:text-3xl" />
              <div className="min-w-0">
                <p className="text-2xs font-bold uppercase tracking-wider text-gold-300">{ui("accountWelcome")}</p>
                <h1 className="ts-display truncate text-xl font-extrabold sm:text-2xl">{user.name || user.email}</h1>
                <ul className="mt-1.5 space-y-0.5 text-xs text-white/80">
                  <li className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-gold-300" />
                    <span className="break-all">{user.email}</span>
                  </li>
                  {user.phone && (
                    <li className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-gold-300" />
                      <span>{user.phone}</span>
                    </li>
                  )}
                </ul>
              </div>
            </div>
            <Button
              onClick={onLogout}
              leadingIcon={<LogOut className="h-4 w-4 shrink-0" />}
              className="w-full shrink-0 sm:w-auto"
            >
              {ui("accountLogout")}
            </Button>
          </div>
        </section>

        {user.role !== "customer" && <FormAlert className="mt-4">{ui("accountStaffNote")}</FormAlert>}

        <nav aria-label={ui("navProfile")} className="mt-4 grid grid-cols-3 gap-3">
          {shortcuts.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col items-center gap-2 rounded-2xl border border-ink-200 bg-surface px-2 py-4 text-center transition-colors hover:border-gold-400 sm:flex-row sm:justify-center sm:gap-3 sm:py-5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-800 transition-colors group-hover:bg-accent group-hover:text-ink-950">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-xs font-bold text-fg sm:text-sm">{label}</span>
            </Link>
          ))}
        </nav>

        {user.role === "customer" && <SmsPreference />}

        {user.role === "customer" && <OrderHistory />}
      </div>
    </div>
  );
}
