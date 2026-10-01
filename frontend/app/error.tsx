"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonClass } from "@/design-system/ui/Button";
import { PAGE_TITLE_CLASS } from "@/design-system/ui/PageHeader";
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
        <h1 className={PAGE_TITLE_CLASS}>Something went wrong</h1>
        <p className="max-w-sm text-sm text-ink-600">
          An unexpected error occurred. You can try again or head back home.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
        <Link href="/" className={buttonClass()}>
          Back to home
        </Link>
      </div>
    </div>
  );
}
