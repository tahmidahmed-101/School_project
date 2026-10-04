"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStorePolicy } from "@/lib/api/store-policy";
import type { ApiStorePolicy } from "@/lib/api/types";
import { useLang } from "@/lib/i18n";
import { Loader } from "@/design-system/patterns/Loader";

type Bilingual = { en?: string; bn?: string };

/**
 * Shipping and return terms for the product page. Shows the policies staff published in the dashboard; while a
 * policy is unpublished (the API answers 404) or the API is unreachable, the storefront's own short copy stands in.
 */
export function ShippingReturns() {
  const { lang, ui, n } = useLang();
  const [policies, setPolicies] = useState<ApiStorePolicy[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([getStorePolicy("shipping"), getStorePolicy("returns")]).then((results) => {
      if (cancelled) return;
      setPolicies(results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const text = (value: Bilingual | undefined) => value?.[lang] || value?.en || "";

  if (policies === null) {
    return (
      <div role="status" className="flex items-center gap-2 pb-3 pt-3 text-xs text-fg-muted">
        <Loader variant="inline" />
        <span>{ui("loading")}</span>
      </div>
    );
  }

  if (policies.length === 0) {
    return (
      <div className="space-y-2 pb-3 pt-3 text-xs leading-relaxed text-fg-muted">
        <p>{ui("shippingReturnsDelivery")}</p>
        <p>{ui("shippingReturnsHelp")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-3 pt-3 text-xs leading-relaxed text-fg-muted">
      {policies.map((policy) => {
        const windowDays = policy.eligibility?.return_window_days;
        return (
          <section key={policy.kind} className="space-y-2">
            <h3 className="font-bold text-fg">{text(policy.title)}</h3>
            {text(policy.intro) && <p className="whitespace-pre-line">{text(policy.intro)}</p>}
            {policy.kind === "returns" && policy.returns_enabled !== false && windowDays ? (
              <p className="font-semibold text-fg">
                {ui("policyReturnWindow")} {n(windowDays)} {ui("policyReturnWindowDays")}
              </p>
            ) : null}
            {policy.sections.map((section, i) => (
              <div key={i}>
                <p className="font-semibold text-fg">{text(section.heading)}</p>
                <p className="whitespace-pre-line">{text(section.body)}</p>
              </div>
            ))}
            {policy.kind === "returns" && (
              <Link href="/return-policy" className="inline-block font-bold text-gold-800 hover:underline">
                {ui("policyReadFull")}
              </Link>
            )}
          </section>
        );
      })}
      {/* A published shipping policy without a returns one (or the reverse) still leaves the contact line useful. */}
      <p>{ui("shippingReturnsHelp")}</p>
    </div>
  );
}
