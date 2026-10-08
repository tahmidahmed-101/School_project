"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ProductKind } from "@/lib/product";
import { useCatalog, usePageProductKind } from "../context";
import { pageShopKind } from "../domain/page-kind";

type RenderWithKind = (kind: ProductKind) => ReactNode;

interface WithPageKindProps {
  basket?: ProductKind | "mixed" | null;
  children: RenderWithKind;
}

function ReadPageKind({ basket, children }: WithPageKindProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { categories } = useCatalog();
  const product = usePageProductKind();
  const slug = searchParams.get("category");
  const category = slug ? categories.find((c) => c.slug === slug) : undefined;
  return <>{children(pageShopKind({ pathname, type: searchParams.get("type"), category, product, basket }))}</>;
}

function PageKindFromPath({ basket, children }: WithPageKindProps) {
  const pathname = usePathname();
  const product = usePageProductKind();
  return <>{children(pageShopKind({ pathname, product, basket }))}</>;
}

/** Hands `children` the shop the visitor is in. Own Suspense boundary, as in `WithActiveCategory`: it reads the query string. */
export function WithPageKind({ basket, children }: WithPageKindProps) {
  return (
    <Suspense fallback={<PageKindFromPath basket={basket}>{children}</PageKindFromPath>}>
      <ReadPageKind basket={basket}>{children}</ReadPageKind>
    </Suspense>
  );
}
