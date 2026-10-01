"use client";

import { useState } from "react";
import { Send, Check } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { ApiError } from "@/lib/api/client";
import { errorKey } from "@/lib/api/errors";
import { subscribeToNewsletter } from "../data/mutations";
import { ScrollReveal } from "@/design-system/patterns/Reveal";
import { Loader } from "@/design-system/patterns/Loader";

export function Newsletter() {
  const { ui } = useLang();
  const [value, setValue] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMsg("");
    try {
      await subscribeToNewsletter(value);
      setIsSubmitted(true);
    } catch (error) {
      // A bad address comes back as a 400 with fields.email; anything else is a connection or server problem.
      setErrorMsg(
        error instanceof ApiError && error.status === 400 && error.fields.email
          ? ui("newsletterInvalidEmail")
          : ui(errorKey(error)),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="relative overflow-hidden border-b border-ink-200 bg-gradient-to-b from-white via-gold-50/20 to-ink-50/40 py-14 sm:py-20">
      <div className="relative z-10 mx-auto max-w-4xl space-y-6 px-4 text-center sm:px-6 lg:px-8">
        <ScrollReveal className="space-y-3">
          <h2 className="ts-display text-2xl font-bold tracking-tight text-gold-700 sm:text-4xl">
            {ui("newsletterTitle")}
          </h2>
          <p className="mx-auto max-w-xl text-sm leading-relaxed text-ink-600">{ui("newsletterSubtitle")}</p>
        </ScrollReveal>

        <ScrollReveal delay={0.1} className="mx-auto max-w-md">
          {isSubmitted ? (
            <div className="shadow-xs flex items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 p-4 text-xs font-semibold text-brand-800">
              <Check className="h-4 w-4 text-brand-600" />
              <span>{ui("newsletterSuccess")}</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
              <input
                type="email"
                autoComplete="email"
                aria-label={ui("newsletterPlaceholder")}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={ui("newsletterPlaceholder")}
                required
                className="shadow-xs flex-1 rounded-full border border-ink-300 bg-white px-4 py-3 text-xs text-ink-900 placeholder-ink-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-gold-500 px-5 py-3 text-xs font-bold text-ink-950 shadow-md shadow-gold-500/20 transition-all hover:bg-gold-400 disabled:opacity-50"
              >
                <span>{ui("newsletterButton")}</span>
                {isSubmitting ? <Loader variant="inline" /> : <Send className="h-3 w-3" />}
              </button>
              {errorMsg && (
                <p role="alert" className="w-full text-left text-[11px] font-semibold text-red-600">
                  {errorMsg}
                </p>
              )}
            </form>
          )}
        </ScrollReveal>
      </div>
    </section>
  );
}
