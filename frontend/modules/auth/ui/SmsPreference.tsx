"use client";

import { useCallback, useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import { Loader } from "@/design-system/patterns/Loader";
import { FormAlert } from "@/design-system/ui/FormField";
import { cardClass } from "@/design-system/ui/Card";
import { useAuth } from "../context";

interface SmsMarketing {
  phone: string;
  opted_in: boolean;
}

const ENDPOINT = "/profile/sms-marketing/";

export function SmsPreference() {
  const { ui } = useLang();
  const { authRequest } = useAuth();
  const [state, setState] = useState<SmsMarketing | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    authRequest<SmsMarketing>(ENDPOINT)
      .then((data) => {
        if (!cancelled) setState(data);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authRequest, attempt]);

  const toggle = useCallback(
    async (optedIn: boolean) => {
      setSaving(true);
      setSaveFailed(false);
      try {
        setState(await authRequest<SmsMarketing>(ENDPOINT, { method: "PATCH", body: { opted_in: optedIn } }));
      } catch {
        setSaveFailed(true);
      } finally {
        setSaving(false);
      }
    },
    [authRequest],
  );

  return (
    <section aria-labelledby="sms-pref-heading" className={cardClass("surface", "mt-4 p-4 sm:p-5")}>
      <h2 id="sms-pref-heading" className="text-sm font-bold text-fg">
        {ui("accountSmsTitle")}
      </h2>

      {loadFailed ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="text-xs text-fg-muted">{ui("accountSmsLoadError")}</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="cursor-pointer text-xs font-bold text-gold-800 hover:underline"
          >
            {ui("tryAgain")}
          </button>
        </div>
      ) : !state ? (
        <Loader variant="inline" className="mt-2" />
      ) : !state.phone ? (
        <p className="mt-2 text-xs text-fg-muted">{ui("accountSmsNoPhone")}</p>
      ) : (
        <label className="mt-2 flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={state.opted_in}
            disabled={saving}
            onChange={(e) => void toggle(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-gold-500 accent-gold-500 focus:ring-gold-500"
          />
          <span className="min-w-0 text-xs text-fg-muted">
            <span className="block font-semibold text-fg">{state.phone}</span>
            {ui("accountSmsDescription")}
          </span>
        </label>
      )}

      {saveFailed && <FormAlert className="mt-3">{ui("accountSmsError")}</FormAlert>}
    </section>
  );
}
