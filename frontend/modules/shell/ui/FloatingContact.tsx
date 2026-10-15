"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import type { BrandInfo } from "@/lib/brand";
import { useLang } from "@/lib/i18n";
import { useBrand } from "@/modules/catalog";
import { MessengerIcon, WhatsAppIcon } from "@/design-system/icons/BrandIcons";

function buildLinks(brand: BrandInfo) {
  return [
    {
      id: "messenger",
      href: brand.facebook.replace("www.facebook.com", "m.me"),
      label: "Message us on Messenger",
      icon: MessengerIcon,
      tint: "bg-facebook",
    },
    {
      id: "whatsapp",
      href: `https://wa.me/${brand.whatsapp}`,
      label: "Chat on WhatsApp",
      icon: WhatsAppIcon,
      tint: "bg-whatsapp",
    },
  ] as const;
}

/** Messenger + WhatsApp shortcuts. Desktop shows both; mobile folds them behind one button above the bottom bar. */
export function FloatingContact() {
  const links = buildLinks(useBrand());
  const pathname = usePathname();
  const { ui } = useLang();
  // Remembering where it was opened closes it on navigation without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  if (pathname.startsWith("/checkout")) return null;

  return (
    <div className="fixed bottom-[calc(72px+env(safe-area-inset-bottom,0px))] right-3 z-30 flex flex-col items-end gap-2 sm:right-5 lg:bottom-6 lg:gap-2.5">
      <div id="floating-contact-links" className={`flex-col gap-2 lg:flex lg:gap-2.5 ${open ? "flex" : "hidden"}`}>
        {links.map(({ id, href, label, icon: Icon, tint }) => (
          <a
            key={id}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            title={label}
            className={`flex h-10 w-10 items-center justify-center rounded-full ${tint} text-white shadow-lg transition-transform duration-200 hover:scale-110 active:scale-95 lg:h-12 lg:w-12`}
          >
            <Icon className="h-5 w-5 lg:h-6 lg:w-6" />
          </a>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setOpenOn(open ? null : pathname)}
        aria-expanded={open}
        aria-controls="floating-contact-links"
        aria-label={ui("messageUs")}
        title={ui("messageUs")}
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-brand-800 text-white shadow-lg transition-transform active:scale-95 lg:hidden"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>
    </div>
  );
}
