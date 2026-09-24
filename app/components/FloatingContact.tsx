"use client";

import { BRAND_INFO } from "../lib/data";
import { MessengerIcon, WhatsAppIcon } from "./BrandIcons";

const LINKS = [
  {
    id: "messenger",
    href: BRAND_INFO.facebook.replace("www.facebook.com", "m.me"),
    label: "Message us on Messenger",
    icon: MessengerIcon,
    tint: "bg-[#1877f2]",
  },
  {
    id: "whatsapp",
    href: `https://wa.me/${BRAND_INFO.whatsapp}`,
    label: "Chat on WhatsApp",
    icon: WhatsAppIcon,
    tint: "bg-[#25d366]",
  },
] as const;

/** Floating Messenger + WhatsApp shortcuts, pinned bottom-right (above the mobile bottom bar). */
export function FloatingContact() {
  return (
    <div className="fixed bottom-[76px] right-3 z-30 flex flex-col gap-2.5 sm:right-5 lg:bottom-6">
      {LINKS.map(({ id, href, label, icon: Icon, tint }) => (
        <a
          key={id}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          title={label}
          className={`flex h-11 w-11 items-center justify-center rounded-full ${tint} text-white shadow-lg transition-transform duration-200 hover:scale-110 active:scale-95 sm:h-12 sm:w-12`}
        >
          <Icon className="h-6 w-6" />
        </a>
      ))}
    </div>
  );
}
