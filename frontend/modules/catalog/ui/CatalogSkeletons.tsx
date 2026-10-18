"use client";

import { useLang } from "@/lib/i18n";
import { Container } from "@/design-system/ui/Container";
import { Skeleton } from "@/design-system/patterns/Skeleton";

function LoadingLabel() {
  const { ui } = useLang();
  return <span className="sr-only">{ui("loading")}</span>;
}

function ProductCardSkeleton() {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-ink-100 bg-canvas p-2 sm:p-2.5">
      <Skeleton className="aspect-square w-full rounded-lg" />
      <Skeleton className="mt-1 h-3.5 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="mt-1 h-8 w-full rounded-full" />
    </div>
  );
}

/** The pre-order and trending product grid, used inside other route skeletons. */
export function ProductGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ShopSkeleton() {
  return (
    <div role="status" aria-live="polite" className="min-h-screen w-full bg-ink-50/60">
      <LoadingLabel />
      <Container className="pb-24 pt-8 sm:pt-10">
        <Skeleton className="mb-4 h-3 w-32" />
        <Skeleton className="mb-8 h-8 w-48" />
        <div className="flex flex-col items-start gap-8 lg:flex-row">
          <div className="hidden w-72 shrink-0 space-y-3 lg:block">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
          </div>
          <div className="w-full min-w-0 flex-1 space-y-4 sm:space-y-6">
            <Skeleton className="h-11 w-full rounded-2xl" />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
