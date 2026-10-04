"use client";

import Link from "next/link";
import { LogIn } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { loginHref } from "@/modules/auth";

type UiKey = "errNetwork" | "errTooMany" | "errServer" | "errGeneric" | "customerOnly";

/**
 * Message for a failed question / price report / review. `duplicate` is the copy for the API's "you already sent
 * this" codes (`duplicate_question`, `already_reported`, `already_reviewed`); other validation messages are shown as
 * the API words them.
 */
export function customerActionError(error: unknown, ui: (key: UiKey) => string, duplicate: string): string {
  if (!(error instanceof ApiError)) return ui("errGeneric");
  if (error.isNetwork) return ui("errNetwork");
  if (["duplicate_question", "already_reported", "already_reviewed"].includes(error.code)) return duplicate;
  if (error.status === 429) return ui("errTooMany");
  if (error.status === 403) return ui("customerOnly");
  if (error.status >= 500 || error.status === 401) return ui("errGeneric");
  return Object.values(error.fields)[0] ?? error.message ?? ui("errGeneric");
}

/** Shown to guests in place of a form: logs in and comes back to this product. */
export function LoginPrompt({ slug, label }: { slug: string; label: string }) {
  return (
    <Link
      href={loginHref(`/product/${slug}`)}
      // The page a guest returns to is this one, so there is nothing to prefetch for a link most never click.
      prefetch={false}
      className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3.5 py-2 text-xs font-bold text-fg transition-colors hover:border-gold-400 hover:text-gold-800"
    >
      <LogIn className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}

/** Confirmation after a successful submit. */
export function SentNote({ children }: { children: string }) {
  return (
    <p role="status" className="rounded-xl border border-gold-300 bg-gold-50 p-3 text-xs font-semibold text-fg">
      {children}
    </p>
  );
}
