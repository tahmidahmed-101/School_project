"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { taka } from "@/lib/format";
import type { Lang, T } from "@/lib/types";
import { DICT, type UiKey } from "@/lib/dictionary";
import { LANG_COOKIE, toLang } from "@/lib/lang";

interface LangContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (v: T | undefined) => string;
  ui: (k: keyof typeof DICT) => string;
  n: (v: number | string) => string;
  money: (v: number) => string;
}

const LangContext = createContext<LangContextType | null>(null);

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

const writeLangCookie = (lang: Lang) => {
  document.cookie = `${LANG_COOKIE}=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`;
};

export function LangProvider({ initialLang, children }: { initialLang: Lang | null; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang ?? "en");
  const router = useRouter();

  // Visitors who chose a language before the cookie existed still have it in localStorage: carry it over once.
  useEffect(() => {
    if (initialLang) return;
    const saved = toLang(window.localStorage.getItem("kullmart:lang"));
    if (!saved) return;
    setLangState(saved);
    writeLangCookie(saved);
    router.refresh();
  }, [initialLang, router]);

  // Keep the document language in step with the toggle so screen readers pick the right voice and the browser
  // offers the right hyphenation and font fallbacks.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Server components read the cookie, so they are asked again once it has changed.
  const setLang = useCallback(
    (l: Lang) => {
      setLangState(l);
      writeLangCookie(l);
      window.localStorage.setItem("kullmart:lang", l);
      router.refresh();
    },
    [router],
  );

  const t = useCallback(
    (v: T | undefined) => {
      if (!v) return "";
      return v[lang] || v.en || "";
    },
    [lang],
  );

  const ui = useCallback(
    (k: keyof typeof DICT) => {
      const entry = DICT[k];
      if (!entry) return k;
      return entry[lang] || entry.en;
    },
    [lang],
  );

  const n = useCallback(
    (v: number | string) => {
      if (lang === "bn") {
        return String(v).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)] ?? d);
      }
      return String(v);
    },
    [lang],
  );

  const money = useCallback(
    (v: number) => {
      const formatted = taka(v);
      return lang === "bn" ? formatted.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)] ?? d) : formatted;
    },
    [lang],
  );

  return <LangContext.Provider value={{ lang, setLang, t, ui, n, money }}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextType {
  const ctx = useContext(LangContext);
  if (!ctx) {
    throw new Error("useLang must be used within LangProvider");
  }
  return ctx;
}

export type { UiKey };
