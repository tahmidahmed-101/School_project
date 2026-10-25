"use client";

import { useEffect, useState } from "react";
import type { ApiReferralSummary } from "@/lib/api/types";
import { useLang } from "@/lib/i18n";
import { referralLink } from "@/lib/referral";
import { Loader } from "@/design-system/patterns/Loader";
import { Button } from "@/design-system/ui/Button";
import { cardClass } from "@/design-system/ui/Card";
import { useAuth } from "../context";

function CopyRow({ label, value }: { label: string; value: string }) {
  const { ui } = useLang();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="min-w-0">
      <p className="text-2xs font-semibold text-fg-muted">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg border border-line bg-surface-muted px-3 py-2 text-xs font-bold text-fg">
          {value}
        </code>
        <Button variant="secondary" className="shrink-0" onClick={copy}>
          {copied ? ui("referralCopied") : ui("referralCopy")}
        </Button>
      </div>
    </div>
  );
}

/** Account-page section with the customer's referral code, share link and earned reward coupons. Hidden while the program is off. */
export function InviteFriends() {
  const { lang, ui, money } = useLang();
  const { authRequest } = useAuth();
  const [summary, setSummary] = useState<ApiReferralSummary | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    authRequest<ApiReferralSummary>("/referral/")
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authRequest, attempt]);

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  if (!loading && !failed && (!summary?.enabled || !summary.code)) return null;

  return (
    <section aria-labelledby="referral-heading" className="mt-8">
      <h2 id="referral-heading" className="ts-display mb-3 text-lg font-extrabold text-gold-700">
        {ui("referralTitle")}
      </h2>

      {loading ? (
        <div role="status" className="flex items-center gap-2 text-xs text-fg-muted">
          <Loader variant="inline" />
          <span>{ui("loading")}</span>
        </div>
      ) : failed || !summary?.code ? (
        <p className="text-xs text-fg-muted">
          {ui("loadFailed")}{" "}
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            className="cursor-pointer text-xs font-bold text-gold-800 hover:text-gold-900 hover:underline"
          >
            {ui("tryAgain")}
          </button>
        </p>
      ) : (
        <div className={cardClass("surface", "shadow-xs space-y-4 p-4")}>
          <p className="text-xs leading-relaxed text-fg-muted">
            {ui("referralIntro")
              .replace("{discount}", money(Number(summary.friend_discount)))
              .replace("{reward}", money(Number(summary.reward_amount)))}
          </p>
          <CopyRow label={ui("referralCodeLabel")} value={summary.code} />
          <CopyRow label={ui("referralLinkLabel")} value={referralLink(window.location.origin, summary.code)} />

          <div className="border-t border-ink-100 pt-3">
            <h3 className="text-xs font-bold text-fg">{ui("referralRewardsTitle")}</h3>
            {summary.rewards.length === 0 ? (
              <p className="mt-1.5 text-xs text-fg-muted">{ui("referralRewardsEmpty")}</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {summary.rewards.map((reward) => (
                  <li
                    key={reward.code}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-ink-100 px-3 py-2 text-xs"
                  >
                    <span className="min-w-0 break-all font-mono font-bold text-fg">{reward.code}</span>
                    <span className="font-bold text-fg">{money(Number(reward.amount))}</span>
                    <span className="w-full text-2xs text-fg-muted sm:w-auto">
                      {reward.used ? ui("referralRewardUsed") : ui("referralRewardUnused")}
                      {!reward.used && ` · ${ui("referralRewardExpires").replace("{date}", date(reward.expires_at))}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
