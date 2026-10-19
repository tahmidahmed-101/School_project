"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/photo";
import { Modal } from "@/design-system/ui/Modal";
import type { PromotionPopup as Popup } from "../domain/storefront-content";

/** Long enough for the page to settle first, so the popup never covers a half-drawn screen. */
const OPEN_DELAY_MS = 1500;

const seenKey = (id: string) => `kullmart:promotion-popup-seen:${id}`;

/** Whether this browser tab already showed the popup. Storage can be blocked; then it simply shows. */
function wasSeen(id: string): boolean {
  try {
    return window.sessionStorage.getItem(seenKey(id)) === "1";
  } catch {
    return false;
  }
}

function markSeen(id: string): void {
  try {
    window.sessionStorage.setItem(seenKey(id), "1");
  } catch {
    // Without storage the popup shows again on the next visit to the page; nothing to recover.
  }
}

/**
 * A dashboard popup for the shop home page or the pre-order page: one image that opens the promotion when clicked.
 * Opens once per browser session per popup, shortly after the page loads.
 */
export function PromotionPopup({ popup }: { popup: Popup | null }) {
  const { ui } = useLang();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!popup || wasSeen(popup.id)) return;
    const timer = window.setTimeout(() => {
      markSeen(popup.id);
      setOpen(true);
    }, OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [popup]);

  if (!popup) return null;
  const close = () => setOpen(false);
  const label = popup.sale?.name ? `${ui("promotionPopupOpen")}: ${popup.sale.name}` : ui("promotionPopupOpen");

  return (
    <Modal open={open} onClose={close} label={ui("close")}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative z-10 translate-y-4 scale-95 opacity-0 transition duration-200 ease-out group-data-[shown=true]:translate-y-0 group-data-[shown=true]:scale-100 group-data-[shown=true]:opacity-100"
      >
        <Link href={popup.href} onClick={close} aria-label={label} className="block overflow-hidden rounded-2xl shadow-2xl">
          <Image
            src={photo(popup.image)}
            alt=""
            width={1080}
            height={1350}
            sizes="(max-width: 640px) 92vw, 512px"
            className="block h-auto max-h-[85vh] w-auto max-w-[min(92vw,32rem)]"
          />
        </Link>
        <button
          type="button"
          onClick={close}
          className="absolute right-3 top-3 rounded-full bg-ink-900/80 p-1.5 text-white shadow-xs transition-colors hover:bg-ink-900"
          aria-label={ui("close")}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </Modal>
  );
}
