"use client";

import { useEffect } from "react";
import { ErrorView } from "@/modules/shell";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorView onRetry={reset} />;
}
