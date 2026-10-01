"use client";

import { useLang } from "@/lib/i18n";
import { ProductGridSkeleton } from "@/modules/catalog";
import { Container } from "@/design-system/ui/Container";
import { Skeleton } from "@/design-system/patterns/Skeleton";

export function PreOrderSkeleton() {
  const { ui } = useLang();
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{ui("loading")}</span>
      <div className="bg-ink-50/70">
        <Container className="pb-1 pt-3">
          <Skeleton className="h-3 w-28" />
        </Container>
        <Container className="pb-4 pt-2 sm:pb-5 sm:pt-3 lg:pb-6 lg:pt-4">
          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12 lg:gap-5">
            <Skeleton className="hidden rounded-3xl lg:col-span-2 lg:block" />
            <Skeleton className="min-h-[220px] rounded-2xl sm:min-h-[280px] sm:rounded-3xl lg:col-span-8 lg:min-h-[360px]" />
            <Skeleton className="hidden rounded-3xl lg:col-span-2 lg:block" />
          </div>
        </Container>
      </div>
      <section className="bg-white py-8 sm:py-14">
        <Container>
          <Skeleton className="mb-6 h-7 w-48 sm:mb-8" />
          <ProductGridSkeleton />
        </Container>
      </section>
    </div>
  );
}
