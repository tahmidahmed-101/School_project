"use client";

import type { BrandInfo } from "@/lib/brand";
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

/** Floating Messenger + WhatsApp shortcuts, pinned bottom-right (above the mobile bottom bar). */
export function FloatingContact() {
  const links = buildLinks(useBrand());
  return (
    <div className="fixed bottom-[76px] right-3 z-30 flex flex-col gap-2.5 sm:right-5 lg:bottom-6">
      {links.map(({ id, href, label, icon: Icon, tint }) => (
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
