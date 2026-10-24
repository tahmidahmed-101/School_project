"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, Phone, X } from "lucide-react";
import type { BrandInfo } from "@/lib/brand";
import { useLang } from "@/lib/i18n";
import { useBrand } from "@/modules/catalog";
import { MessengerIcon, WhatsAppIcon } from "@/design-system/icons/BrandIcons";

/** Top to bottom as they stack above the button; only the ones filled in on the dashboard. */
function buildLinks({ contact }: BrandInfo) {
  return [
    contact.messenger && {
      id: "messenger",
      href: contact.messenger,
      label: "contactMessenger" as const,
      icon: MessengerIcon,
      tint: "bg-facebook",
      external: true,
    },
    contact.phoneTel && {
      id: "call",
      href: `tel:${contact.phoneTel}`,
      label: "contactCall" as const,
      icon: Phone,
      tint: "bg-call",
      external: false,
    },
    contact.whatsapp && {
      id: "whatsapp",
      href: `https://wa.me/${contact.whatsapp}`,
      label: "contactWhatsApp" as const,
      icon: WhatsAppIcon,
      tint: "bg-whatsapp",
      external: true,
    },
  ].filter(<T,>(link: T | ""): link is T => link !== "");
}

/** One rippling contact button; pressing it fans out Call, WhatsApp and Messenger above it. */
export function FloatingContact() {
  const links = buildLinks(useBrand());
  const pathname = usePathname();
  const { ui } = useLang();
  // Remembering where it was opened closes it on navigation without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  if (pathname.startsWith("/checkout") || links.length === 0) return null;

  return (
    <div className="fixed bottom-[calc(72px+env(safe-area-inset-bottom,0px))] right-3 z-30 flex flex-col items-end gap-3 sm:right-5 lg:bottom-6">
      <ul id="floating-contact-links" className="flex flex-col items-end gap-3" aria-hidden={!open}>
        {links.map(({ id, href, label, icon: Icon, tint, external }, index) => (
          <li
            key={id}
            // Fans out bottom-up: the option nearest the button arrives first.
            style={{ transitionDelay: open ? `${(links.length - 1 - index) * 60}ms` : "0ms" }}
            className={`transition-all duration-300 ease-out motion-reduce:transition-none ${
              open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
            }`}
          >
            <a
              href={href}
              {...(external && { target: "_blank", rel: "noopener noreferrer" })}
              tabIndex={open ? undefined : -1}
              className="group flex items-center gap-3"
            >
              <span className="whitespace-nowrap rounded-lg bg-surface px-3 py-1.5 text-sm font-medium text-fg shadow-md">
                {ui(label)}
              </span>
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-full ${tint} text-white shadow-lg transition-transform duration-200 group-hover:scale-110 group-active:scale-95 lg:h-12 lg:w-12`}
              >
                <Icon className="h-5 w-5" />
              </span>
            </a>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setOpenOn(open ? null : pathname)}
        aria-expanded={open}
        aria-controls="floating-contact-links"
        aria-label={ui(open ? "closeContact" : "messageUs")}
        title={ui("messageUs")}
        className="relative flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-action text-action-fg shadow-lg transition-transform duration-300 hover:scale-110 active:scale-95 lg:h-14 lg:w-14"
      >
        {/* The ripple: stops once the options are open, and for anyone who asked for less motion. */}
        {!open && (
          <span aria-hidden className="absolute inset-0 rounded-full bg-action opacity-75 motion-safe:animate-ping" />
        )}
        <span className={`relative transition-transform duration-300 ${open ? "rotate-90" : ""}`}>
          {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        </span>
      </button>
    </div>
  );
}
