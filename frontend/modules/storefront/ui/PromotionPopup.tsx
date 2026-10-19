"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/photo";
import { Modal } from "@/design-system/ui/Modal";
import { buttonClass } from "@/design-system/ui/Button";
import { DiscountBadge } from "@/design-system/patterns/DiscountBadge";
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

/** "26 Oct" / "২৬ অক্টো" in Dhaka time, or null for a missing or broken date. */
function shortDate(iso: string | undefined, lang: string): string | null {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Dhaka",
  }).format(date);
}

/**
 * A dashboard popup, for the shop home page (sale-led) or the pre-order page (no sale). Opens once per browser session
 * per campaign, shortly after the page loads.
 */
export function PromotionPopup({ popup }: { popup: Popup | null }) {
  const { t, ui, money, n, lang } = useLang();
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
  const sale = popup.sale;
  const endsLabel = shortDate(sale?.endsAt, lang);

  return (
    <Modal open={open} onClose={close} label={ui("close")}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="promotion-popup-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg translate-y-4 scale-95 flex-col overflow-hidden rounded-2xl border border-ink-200 bg-canvas opacity-0 shadow-2xl transition duration-200 ease-out group-data-[shown=true]:translate-y-0 group-data-[shown=true]:scale-100 group-data-[shown=true]:opacity-100"
      >
        <button
          type="button"
          onClick={close}
          className="absolute right-3 top-3 z-10 rounded-full bg-canvas/90 p-1.5 text-fg-muted shadow-xs transition-colors hover:bg-surface-muted hover:text-fg"
          aria-label={ui("close")}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="overflow-y-auto">
          {popup.image && (
            <div className="relative aspect-[16/7] w-full bg-surface">
              <Image
                src={photo(popup.image)}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, 512px"
                className="object-cover"
              />
            </div>
          )}

          <div className="space-y-4 p-5 sm:p-6">
            <div className="space-y-1.5 pr-8">
              {sale ? (
                <p className="text-2xs font-bold uppercase tracking-wider text-danger">
                  {ui("promotionPopupSale").replace("{percent}", n(sale.percentOff)).replace("{name}", sale.name)}
                  {endsLabel && ` · ${ui("promotionPopupEnds").replace("{date}", endsLabel)}`}
                </p>
              ) : (
                <p className="text-2xs font-bold uppercase tracking-wider text-gold-800">{ui("preOrderBadge")}</p>
              )}
              <h2 id="promotion-popup-title" className="text-lg font-bold leading-snug text-fg sm:text-xl">
                {t(popup.title)}
              </h2>
              {t(popup.body) && <p className="text-sm leading-relaxed text-fg-muted">{t(popup.body)}</p>}
            </div>

            {popup.products.length > 0 && (
              <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {popup.products.map((card) => (
                  <li key={card.id}>
                    <Link
                      href={`/product/${card.slug}`}
                      onClick={close}
                      className="group/card flex h-full flex-col rounded-xl border border-ink-200 p-2 transition-colors hover:border-gold-400"
                    >
                      <div className="relative mb-1.5 aspect-square w-full overflow-hidden rounded-lg bg-surface">
                        {card.image && (
                          <Image
                            src={photo(card.image)}
                            alt={card.name}
                            fill
                            sizes="160px"
                            className="object-cover transition-transform duration-300 group-hover/card:scale-105"
                          />
                        )}
                        {card.percentOff !== undefined && (
                          <DiscountBadge percent={card.percentOff} className="absolute left-1 top-1" />
                        )}
                      </div>
                      <span className="line-clamp-2 text-xs font-semibold leading-tight text-fg">{card.name}</span>
                      {shortDate(card.releaseDate, lang) && (
                        <span className="mt-0.5 text-2xs font-medium text-gold-800">
                          {ui("expectedDelivery")}: {shortDate(card.releaseDate, lang)}
                        </span>
                      )}
                      <span className="mt-auto flex flex-wrap items-baseline gap-x-1.5 pt-1">
                        <span className="text-sm font-bold text-gold-800">{money(card.price)}</span>
                        {card.originalPrice !== undefined && (
                          <span className="text-2xs text-fg-muted line-through">{money(card.originalPrice)}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {popup.cta && (
              <Link href={popup.cta.url} onClick={close} className={buttonClass({ size: "lg", fullWidth: true })}>
                {t(popup.cta.label)}
              </Link>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
