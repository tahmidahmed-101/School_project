"use client";

import { useLang } from "@/lib/i18n";
import { Container } from "@/design-system/ui/Container";
import { Skeleton } from "@/design-system/patterns/Skeleton";
import { cardClass } from "@/design-system/ui/Card";

export function CheckoutSkeleton() {
  const { ui } = useLang();
  return (
    <div role="status" aria-live="polite" className="min-h-screen bg-canvas py-8 sm:py-12">
      <span className="sr-only">{ui("loading")}</span>
      <Container>
        <Skeleton className="mb-4 h-3 w-32" />
        <Skeleton className="mb-8 h-8 w-40" />
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            {[4, 3].map((rows, i) => (
              <div key={i} className="space-y-4 rounded-3xl border border-ink-200 bg-canvas p-6 sm:p-8">
                <Skeleton className="h-5 w-40" />
                {Array.from({ length: rows }, (_, j) => (
                  <Skeleton key={j} className="h-11 w-full rounded-xl" />
                ))}
              </div>
            ))}
          </div>
          <div className={cardClass("canvas", "space-y-4 p-5 lg:col-span-5")}>
            <Skeleton className="h-4 w-32" />
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-full" />
          </div>
        </div>
      </Container>
    </div>
  );
}
