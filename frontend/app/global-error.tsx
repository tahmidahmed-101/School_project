"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-error";

/**
 * Last-resort boundary for a failure in the root layout itself (where error.tsx cannot help). It replaces the
 * whole document, so it renders its own <html>/<body> and uses plain inline styles: nothing from the layout,
 * Tailwind theme or providers is guaranteed to exist here.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    reportClientError(error, "error-boundary");
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", color: "#162114", background: "#ffffff" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            padding: "0 16px",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "24px", margin: 0 }}>Something went wrong</h1>
          <p style={{ maxWidth: "24rem", fontSize: "14px", color: "#536450", margin: 0 }}>
            School Project hit an unexpected problem. Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              cursor: "pointer",
              border: 0,
              borderRadius: "9999px",
              padding: "12px 24px",
              fontSize: "12px",
              fontWeight: 700,
              color: "#ffffff",
              background: "#276325",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
