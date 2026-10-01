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
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-ink-100 bg-white p-2 sm:p-2.5">
      <Skeleton className="aspect-square w-full rounded-lg" />
      <Skeleton className="mt-1 h-3.5 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="mt-1 h-8 w-full rounded-full" />
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

export function ProductDetailSkeleton() {
  return (
    <div role="status" aria-live="polite" className="w-full bg-white pb-24 pt-8 sm:pt-12 lg:pb-12">
      <LoadingLabel />
      <Container>
        <div className="mb-8 border-b border-ink-100 pb-4">
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-16 xl:gap-20">
          <div className="space-y-3">
            <Skeleton className="aspect-[4/5] w-full rounded-xl" />
            <div className="flex gap-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-16 w-16 rounded-lg" />
              ))}
            </div>
          </div>
          <div className="space-y-4 lg:pl-4 xl:pl-8">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-4/5" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-10 w-40" />
            <div className="flex gap-3">
              <Skeleton className="h-12 flex-1 rounded-full" />
              <Skeleton className="h-12 flex-1 rounded-full" />
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
