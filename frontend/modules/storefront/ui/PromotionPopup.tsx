"use client";

import { useEffect, useState } from "react";
import { getImageProps } from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/photo";
import { Modal } from "@/design-system/ui/Modal";
import { pickPromotionPopup, type PromotionPopup as Popup } from "../domain/storefront-content";

/** Long enough for the page to settle first, so the popup never covers a half-drawn screen. */
const OPEN_DELAY_MS = 2000;

const FRAME = "block overflow-hidden rounded-2xl shadow-2xl";

/** Enter and exit length; the shared Modal keeps the dialog mounted this long on close so the exit can finish. */
const ANIMATION_MS = 300;

/** The `<img>` props next/image would render for the popup, so preloading and showing use the very same file. */
function popupImageProps(src: string, alt: string) {
  return getImageProps({
    src: photo(src),
    alt,
    width: 1080,
    height: 1350,
    sizes: "(max-width: 640px) 92vw, 512px",
    // Eager: a lazy image waits to be seen, so it would pop in after the popup had started to slide in.
    loading: "eager",
    className: "block h-auto max-h-[85vh] w-auto max-w-[min(92vw,32rem)]",
  }).props;
}

/**
 * Loads and decodes the image the browser will pick before the popup opens, so it slides in whole rather than
 * as an empty frame that jumps when the picture arrives. A failed load still lets the popup open.
 */
function preload({ src, srcSet, sizes }: ReturnType<typeof popupImageProps>): Promise<void> {
  const image = new window.Image();
  if (sizes) image.sizes = sizes;
  if (srcSet) image.srcset = srcSet;
  image.src = src;
  return image.decode().catch(() => undefined);
}

const seenKey = (id: string) => `schoolproject:promotion-popup-seen:${id}`;

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
 * The dashboard popup campaign for this page: the highest-priority one that is inside its schedule,
 * opened shortly after the page loads, on desktop and mobile alike. One image that opens the destination when clicked,
 * or just the image when the popup has none. Opens once per browser session per popup.
 */
export function PromotionPopup({ popups }: { popups: Popup[] }) {
  const { ui } = useLang();
  const [popup, setPopup] = useState<Popup | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // The time is only known in the browser, so the choice is made after mount.
    const chosen = pickPromotionPopup(popups, Date.now());
    if (!chosen || wasSeen(chosen.id)) return;
    let cancelled = false;
    // The image loads during the delay; the popup opens once both are done.
    const delay = new Promise<void>((resolve) => window.setTimeout(resolve, OPEN_DELAY_MS));
    void Promise.all([delay, preload(popupImageProps(chosen.image, ""))]).then(() => {
      if (cancelled) return;
      markSeen(chosen.id);
      setPopup(chosen);
      setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [popups]);

  if (!popup) return null;
  const close = () => setOpen(false);
  const label = popup.sale?.name ? `${ui("promotionPopupOpen")}: ${popup.sale.name}` : ui("promotionPopupOpen");
  // Without a destination the image is the whole message, so it carries the dialog's label as its text.
  const imageProps = popupImageProps(popup.image, popup.href ? "" : label);
  // Sync decoding: the file is already decoded (see `preload`), so it is drawn in the very first frame of the
  // enter animation instead of the popup opening empty.
  // eslint-disable-next-line @next/next/no-img-element -- the props come from next/image's getImageProps.
  const image = <img {...imageProps} alt={imageProps.alt} decoding="sync" />;

  return (
    // No backdrop blur: fading a full-screen blur repaints the whole page every frame and stutters.
    <Modal open={open} onClose={close} label={ui("close")} durationMs={ANIMATION_MS} backdropClassName="bg-ink-900/60">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={{ transitionDuration: `${ANIMATION_MS}ms` }}
        // Fade and slide only (no scale): both run on the GPU, so the large image is never repainted mid-move.
        className="relative z-10 translate-y-6 transform-gpu opacity-0 transition-[opacity,transform] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[opacity,transform] motion-reduce:translate-y-0 group-data-[shown=true]:translate-y-0 group-data-[shown=true]:opacity-100"
      >
        {popup.href ? (
          <Link href={popup.href} onClick={close} aria-label={label} className={FRAME}>
            {image}
          </Link>
        ) : (
          <div className={FRAME}>{image}</div>
        )}
        <button
          type="button"
          onClick={close}
          className="absolute right-3 top-3 cursor-pointer rounded-full bg-ink-900/80 p-1.5 text-white shadow-xs transition-colors hover:bg-ink-900"
          aria-label={ui("close")}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </Modal>
  );
}
