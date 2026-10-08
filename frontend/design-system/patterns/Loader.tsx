"use client";

import { useLang } from "@/lib/i18n";

type LoaderVariant = "page" | "section" | "inline";

interface LoaderProps {
  /**
   * page    — fills the content area while a route loads
   * section — a block inside a page
   * inline  — a small spinner for buttons and one-line states
   */
  variant?: LoaderVariant;
  /** Overrides the default "Loading…" text (not shown for the inline variant). */
  label?: string;
  className?: string;
}

const WRAPPER_CLASS: Record<Exclude<LoaderVariant, "inline">, string> = {
  page: "min-h-screen",
  section: "min-h-[240px]",
};

/** Loading indicator: a gold arc spinning around a pale ring, with a short label. */
export function Loader({ variant = "page", label, className = "" }: LoaderProps) {
  const { ui } = useLang();
  const text = label ?? ui("loading");

  if (variant === "inline") {
    return (
      <span role="status" aria-live="polite" className={`inline-flex items-center ${className}`}>
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
        <span className="sr-only">{text}</span>
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex w-full flex-col items-center justify-center gap-5 bg-canvas px-4 ${WRAPPER_CLASS[variant]} ${className}`}
    >
      {/* Gold arc spinning around a pale track */}
      <div className="relative h-14 w-14">
        <span aria-hidden="true" className="absolute inset-0 rounded-full border-4 border-gold-100" />
        <span
          aria-hidden="true"
          className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-gold-500"
        />
      </div>

      <div className="flex items-center gap-1.5 text-sm font-semibold text-fg-muted">
        <span>{text}</span>
        <span aria-hidden="true" className="flex items-end gap-0.5 pb-1">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="h-1 w-1 animate-bounce rounded-full bg-accent"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
