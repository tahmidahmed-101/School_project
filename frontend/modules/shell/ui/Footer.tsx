"use client";

import Image from "next/image";
import Link from "next/link";
import { MapPin, Phone, Mail, Clock } from "lucide-react";
import { FacebookIcon, WhatsAppIcon } from "@/design-system/icons/BrandIcons";
import { useBrand, useCatalog } from "@/modules/catalog";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/photo";
import { containerClass } from "@/design-system/ui/Container";

export function Footer() {
  const { t, ui, lang } = useLang();
  const BRAND_INFO = useBrand();
  const { categories: allCategories } = useCatalog();
  // Pre-order has its own nav link and category rail; the footer covers the regular stock catalogue.
  const categories = allCategories.filter((category) => category.type === "stock");

  return (
    <footer className="border-t border-brand-950 bg-brand-900 pb-[calc(1.75rem+env(safe-area-inset-bottom,0px))] text-xs text-white/75 lg:pb-0">
      <div className={containerClass("default", "space-y-12 py-12 sm:py-16")}>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-12 lg:gap-12">
          {/* Col 1: Brand & Bio (4 cols) */}
          <div className="space-y-4 lg:col-span-4">
            <Link href="/" className="group flex w-fit items-center gap-2 sm:gap-2.5">
              <Image
                src={photo(BRAND_INFO.logoCart)}
                alt={BRAND_INFO.name}
                width={382}
                height={282}
                className="h-8 w-auto shrink-0 drop-shadow-lg transition-transform duration-300 group-hover:scale-105 sm:h-10"
              />
              <span className="text-base font-extrabold tracking-[0.12em] text-white transition-colors group-hover:text-gold-300 sm:text-lg lg:text-xl">
                {lang === "bn" ? "কুল মার্ট" : "KULL MART"}
              </span>
            </Link>
            <p className="max-w-sm leading-relaxed text-white/75">{ui("footerAboutText")}</p>
            <div className="flex items-center gap-3 pt-1">
              <a
                href={BRAND_INFO.facebook}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={ui("facebookLink")}
                title="Facebook"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-all hover:-translate-y-0.5 hover:border-gold-300 hover:bg-gold-500 hover:text-brand-950"
              >
                <FacebookIcon className="h-5 w-5" />
              </a>
              <a
                href={`https://wa.me/${BRAND_INFO.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={ui("whatsappLink")}
                title="WhatsApp"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-all hover:-translate-y-0.5 hover:border-gold-300 hover:bg-gold-500 hover:text-brand-950"
              >
                <WhatsAppIcon className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Col 2: Categories (3 cols) */}
          <div className="space-y-3 lg:col-span-3">
            <h4 className="text-xs font-bold uppercase tracking-wide text-white">{ui("footerCategories")}</h4>
            <ul className="space-y-2">
              {categories.map((cat) => (
                <li key={cat.id}>
                  <Link href={`/shop?category=${cat.slug}`} className="transition-colors hover:text-gold-300">
                    {t(cat.name)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3: Quick links (2 cols) */}
          <div className="space-y-3 lg:col-span-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-white">{ui("footerQuickLinks")}</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/" className="transition-colors hover:text-gold-300">
                  {ui("navHome")}
                </Link>
              </li>
              <li>
                <Link href="/shop" className="transition-colors hover:text-gold-300">
                  {ui("navShop")}
                </Link>
              </li>
              <li>
                <Link href="/pre-order" className="transition-colors hover:text-gold-300">
                  {ui("navPreOrder")}
                </Link>
              </li>
              <li>
                <Link href="/checkout" className="transition-colors hover:text-gold-300">
                  {ui("checkoutTitle")}
                </Link>
              </li>
              <li>
                <Link href="/track-order" className="transition-colors hover:text-gold-300">
                  {ui("navTrackOrder")}
                </Link>
              </li>
              <li>
                <Link href="/return-policy" className="transition-colors hover:text-gold-300">
                  {ui("footerReturnPolicy")}
                </Link>
              </li>
              <li>
                <Link href="/refund-policy" className="transition-colors hover:text-gold-300">
                  {ui("footerRefundPolicy")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4: Store Contact (3 cols) */}
          <div className="space-y-3 lg:col-span-3">
            <h4 className="text-xs font-bold uppercase tracking-wide text-white">{ui("footerContactUs")}</h4>
            <ul className="space-y-2.5">
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" />
                <span>{t(BRAND_INFO.address)}</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-gold-300" />
                <a href={`tel:${BRAND_INFO.phone}`} className="transition-colors hover:text-gold-300">
                  {BRAND_INFO.phoneInternational}
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-gold-300" />
                <a href={`mailto:${BRAND_INFO.email}`} className="transition-colors hover:text-gold-300">
                  {BRAND_INFO.email}
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0 text-gold-300" />
                <span>{ui("footerHours")}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Rights & Disclosures */}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/15 pt-8 text-2xs text-white/60 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {BRAND_INFO.name}. {ui("footerRights")}
          </p>
          <p className="max-w-lg text-center text-white/60 sm:text-right">{ui("footerDisclaimer")}</p>
        </div>
      </div>
    </footer>
  );
}
