"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] w-full flex-col items-center justify-center gap-5 bg-white px-4 text-center">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-4 border-gold-100">
        <AlertTriangle className="h-7 w-7 text-gold-500" />
      </div>
      <div className="space-y-1.5">
        <h1 className="ts-display text-xl font-bold text-ink-900 sm:text-2xl">
          Something went wrong
        </h1>
        <p className="max-w-sm text-sm text-ink-600">
          An unexpected error occurred. You can try again or head back home.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="cursor-pointer rounded-full border border-ink-200 bg-white px-5 py-3 text-xs font-bold text-ink-800 transition-colors hover:bg-ink-50"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-6 py-3 text-xs font-bold text-white shadow-md transition-colors hover:bg-brand-800"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
