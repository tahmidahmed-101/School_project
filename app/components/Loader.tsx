"use client";

import Image from "next/image";
import { BRAND_INFO } from "../lib/data";
import { useLang } from "../lib/i18n";
import { photo } from "../lib/photo";

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
  page: "min-h-[70vh]",
  section: "min-h-[240px]",
};

/** Branded loading indicator: the gold cart on a green disc, with a gold ring spinning around it. */
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
      className={`flex w-full flex-col items-center justify-center gap-5 bg-white px-4 ${WRAPPER_CLASS[variant]} ${className}`}
    >
      <div className="relative flex h-20 w-20 items-center justify-center">
        {/* Track and spinning gold arc */}
        <span aria-hidden="true" className="absolute inset-0 rounded-full border-[3px] border-gold-100" />
        <span
          aria-hidden="true"
          className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-gold-500"
        />

        {/* Brand disc with the cart */}
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-800 shadow-md">
          <Image
            src={photo(BRAND_INFO.logoCart)}
            alt=""
            width={382}
            height={282}
            priority
            className="h-7 w-auto animate-pulse"
          />
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-600">
        <span>{text}</span>
        <span aria-hidden="true" className="flex items-end gap-0.5 pb-1">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="h-1 w-1 animate-bounce rounded-full bg-gold-500"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
