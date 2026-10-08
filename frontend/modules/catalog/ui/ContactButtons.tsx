"use client";

import { MessageSquare, Phone } from "lucide-react";
import { buttonClass } from "@/design-system/ui/Button";
import { useBrand } from "../context";
import { useLang } from "@/lib/i18n";

/** WhatsApp and call buttons for the shop; `whatsappText` must already be URL-encoded. */
export function ContactButtons({ whatsappText }: { whatsappText: string }) {
  const { ui } = useLang();
  const BRAND_INFO = useBrand();

  return (
    <>
      <a
        href={`https://wa.me/${BRAND_INFO.whatsapp}?text=${whatsappText}`}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass({ variant: "secondary", fullWidth: true })}
      >
        <MessageSquare className="h-4 w-4" />
        <span>{ui("orderWhatsappConfirm")}</span>
      </a>
      <a href={`tel:${BRAND_INFO.phoneTel}`} className={buttonClass({ variant: "outline", fullWidth: true })}>
        <Phone className="h-4 w-4 text-gold-500" />
        <span>
          {ui("orderCallStore")} ({BRAND_INFO.phone})
        </span>
      </a>
    </>
  );
}
