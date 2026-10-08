"use client";

import { Check, Ticket } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { SITE_SETTINGS } from "../domain/site-settings";
import type { Voucher } from "../domain/vouchers";
import { useCollectedCodes, useVoucherText } from "./useVouchers";
import { CardReveal, ScrollReveal } from "@/design-system/patterns/Reveal";
import { Container } from "@/design-system/ui/Container";
import { SectionHeading } from "@/design-system/ui/SectionHeading";
import { cardClass } from "@/design-system/ui/Card";

/**
 * "Collect voucher" strip shown below the promo marquee; toggled via SITE_SETTINGS.voucherSection.enabled.
 * Collecting reveals the code and saves it in this browser, where checkout offers it back in one tap.
 */
export function VoucherSection({ vouchers }: { vouchers: Voucher[] }) {
  const { lang, ui } = useLang();
  const { codes: collected, collect } = useCollectedCodes();
  const text = useVoucherText();

  if (!SITE_SETTINGS.voucherSection.enabled || vouchers.length === 0) return null;

  return (
    <Container className="pb-4 pt-3 sm:pb-6 sm:pt-4">
      <section aria-label={ui("voucherTitle")}>
        <ScrollReveal className="mb-3">
          <SectionHeading title={ui("voucherTitle")} />
        </ScrollReveal>
        <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto overflow-y-hidden overscroll-x-contain py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:py-0 lg:grid-cols-4">
          {vouchers.map((v, idx) => {
            const isCollected = collected.includes(v.code);
            return (
              <CardReveal
                key={v.code}
                delay={(idx % 4) * 0.08}
                className="w-[250px] min-w-0 shrink-0 snap-start sm:w-auto sm:shrink"
              >
                <div className={cardClass("canvas", "flex h-full items-stretch overflow-hidden shadow-sm")}>
                  <div className="flex w-16 shrink-0 flex-col items-center justify-center gap-1 bg-brand-800 py-3 text-gold-300 sm:w-20 lg:w-16">
                    <Ticket className="h-6 w-6" />
                    {/* Decorative stamp in a 64px column; 10px is the largest size that fits "KULL MART". */}
                    <span aria-hidden="true" className="whitespace-nowrap text-2xs font-extrabold tracking-wide">
                      {lang === "bn" ? "কুল মার্ট" : "KULL MART"}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2.5 py-3 sm:gap-3 sm:px-3 lg:gap-2 lg:px-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-gold-800 sm:text-base">{text.title(v)}</p>
                      <p className="truncate text-2xs text-fg-subtle">
                        {isCollected ? (
                          <>
                            {ui("voucherCode")}: <span className="font-mono font-bold text-fg">{v.code}</span>
                          </>
                        ) : (
                          text.condition(v)
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => collect(v.code)}
                      disabled={isCollected}
                      className={`flex shrink-0 cursor-pointer whitespace-nowrap items-center gap-1 rounded-full px-2.5 py-2 text-2xs sm:px-3 font-bold transition-colors ${
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
    </Container>
  );
}
