"use client";

import { Check, Ticket } from "lucide-react";
import { useLang } from "../lib/i18n";
import { SITE_SETTINGS } from "../lib/site-settings";
import { usePersistedState } from "../lib/usePersistedState";
import { CardReveal, ScrollReveal } from "./Reveal";

/** "Collect voucher" strip shown below the promo marquee; toggled via SITE_SETTINGS.voucherSection.enabled. */
export function VoucherSection() {
  const { lang, t, ui } = useLang();
  const [collected, setCollected] = usePersistedState<string[]>("km-collected-vouchers", []);
  const { enabled, vouchers } = SITE_SETTINGS.voucherSection;

  if (!enabled || vouchers.length === 0) return null;

  const collect = (code: string) =>
    setCollected((prev) => (prev.includes(code) ? prev : [...prev, code]));

  return (
    <div className="mx-auto max-w-7xl px-4 pb-4 pt-3 sm:px-6 sm:pb-6 sm:pt-4 lg:px-8">
      <section aria-label={ui("voucherTitle")}>
        <ScrollReveal className="mb-3">
          <h2 className="ts-display text-xl font-bold tracking-tight text-gold-600 sm:text-2xl">{ui("voucherTitle")}</h2>
        </ScrollReveal>
        <div className="-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
          {vouchers.map((v, idx) => {
            const isCollected = collected.includes(v.code);
            return (
              <CardReveal key={v.code} delay={(idx % 4) * 0.08} className="w-[78%] shrink-0 snap-start sm:w-auto sm:shrink">
              <div className="flex h-full items-stretch overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
                <div className="flex w-16 shrink-0 flex-col sm:w-20 items-center justify-center gap-1 bg-brand-800 py-3 text-gold-300 lg:w-16">
                  <Ticket className="h-6 w-6" />
                  <span className="whitespace-nowrap text-[9px] font-extrabold tracking-wider">
                    {lang === "bn" ? "কুল মার্ট" : "KULL MART"}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-3 lg:gap-2 lg:px-2.5">
                  <div className="min-w-0">
                    <p className="whitespace-nowrap sm:truncate text-base font-extrabold text-gold-600 sm:text-lg">{t(v.title)}</p>
                    <p className="whitespace-nowrap sm:truncate text-[11px] text-ink-500 sm:text-xs">{t(v.condition)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => collect(v.code)}
                    disabled={isCollected}
                    className={`flex shrink-0 cursor-pointer whitespace-nowrap items-center gap-1 rounded-md px-3 py-2 text-xs font-bold transition-colors ${
                      isCollected
                        ? "cursor-default bg-brand-100 text-brand-800"
                        : "bg-gold-400 text-ink-950 hover:bg-gold-300"
                    }`}
                  >
                    {isCollected && <Check className="h-3.5 w-3.5" />}
                    {isCollected ? ui("voucherCollected") : ui("voucherCollect")}
                  </button>
                </div>
              </div>
              </CardReveal>
            );
          })}
        </div>
      </section>
    </div>
  );
}
