"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-error";
import { ErrorView } from "@/modules/shell";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    reportClientError(error, "error-boundary");
  }, [error]);

  return <ErrorView onRetry={reset} />;
}
