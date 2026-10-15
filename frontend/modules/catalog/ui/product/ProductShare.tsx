"use client";

import { useEffect, useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { FacebookIcon, WhatsAppIcon } from "@/design-system/icons/BrandIcons";
import { ACCORDION_BODY } from "@/design-system/ui/AccordionItem";

const CHIP_CLASS =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-ink-200 bg-canvas px-3.5 py-2 text-sm font-bold text-fg transition-colors hover:border-gold-400 hover:text-gold-800";

/** Share links for a product. Plain links to each network's share page: no SDKs, nothing loaded until clicked. */
export function ProductShare({ slug, name }: { slug: string; name: string }) {
  const { ui } = useLang();
  // Built in the browser so the link carries whichever origin the customer is actually on.
  const [url, setUrl] = useState("");
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}/product/${slug}`);
    setCanNativeShare(typeof navigator.share === "function");
  }, [slug]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const text = `${ui("shareMessage")} ${name}`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
  const facebookHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard blocked (insecure origin, permission denied): the other buttons still work.
    }
  };

  const nativeShare = () => {
    // Rejects when the customer closes the share sheet; that is not an error.
    navigator.share({ title: name, text, url }).catch(() => {});
  };

  return (
    <div className={`space-y-3 ${ACCORDION_BODY}`}>
      <p>{ui("shareIntro")}</p>
      {url && (
        <div className="flex flex-wrap gap-2">
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className={CHIP_CLASS}>
            <WhatsAppIcon className="h-3.5 w-3.5 text-whatsapp" />
            {ui("shareWhatsApp")}
          </a>
          <a href={facebookHref} target="_blank" rel="noopener noreferrer" className={CHIP_CLASS}>
            <FacebookIcon className="h-3.5 w-3.5 text-facebook" />
            {ui("shareFacebook")}
          </a>
          <button type="button" onClick={copyLink} className={CHIP_CLASS}>
            {copied ? <Check className="h-3.5 w-3.5 text-brand-800" /> : <Link2 className="h-3.5 w-3.5" />}
            <span aria-live="polite">{copied ? ui("shareCopied") : ui("shareCopy")}</span>
          </button>
          {canNativeShare && (
            <button type="button" onClick={nativeShare} className={CHIP_CLASS}>
              <Share2 className="h-3.5 w-3.5" />
              {ui("shareMore")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
