"use client";

import { useLang } from "@/lib/i18n";
import { ProductGridSkeleton } from "@/modules/catalog";
import { Container } from "@/design-system/ui/Container";
import { Skeleton } from "@/design-system/patterns/Skeleton";

/** Banner row placeholder: side panels on desktop, the banner alone on mobile, as in Hero. */
function HeroSkeleton({ side, banner }: { side: string; banner: string }) {
  return (
    <Container className="pb-4 pt-2 sm:pb-5 sm:pt-3 lg:pb-6 lg:pt-4">
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12 lg:gap-5">
        <Skeleton className={`hidden rounded-3xl lg:block ${side}`} />
        <Skeleton className={`min-h-[220px] rounded-2xl sm:min-h-[280px] sm:rounded-3xl lg:min-h-[360px] ${banner}`} />
        <Skeleton className={`hidden rounded-3xl lg:block ${side}`} />
      </div>
    </Container>
  );
}

function ShelfSkeleton() {
  return (
    <section className="bg-white py-8 sm:py-14">
      <Container>
        <Skeleton className="mb-6 h-7 w-48 sm:mb-8" />
        <ProductGridSkeleton />
      </Container>
    </section>
  );
}

export function PreOrderSkeleton() {
  const { ui } = useLang();
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{ui("loading")}</span>
      <div className="bg-ink-50/70">
        <Container className="pb-1 pt-3">
          <Skeleton className="h-3 w-28" />
        </Container>
        <HeroSkeleton side="lg:col-span-2" banner="lg:col-span-8" />
      </div>
      <ShelfSkeleton />
    </div>
  );
}

/** Shown while the home page loads: the banner row and the first product shelf. */
export function HomeSkeleton() {
  const { ui } = useLang();
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{ui("loading")}</span>
      <div className="bg-ink-50/70">
        <HeroSkeleton side="lg:col-span-3" banner="lg:col-span-6" />
      </div>
      <ShelfSkeleton />
    </div>
  );
}
