"use client";

import { Suspense, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

type RenderWithCategory = (activeCategory: string | null) => ReactNode;

function ReadActiveCategory({ children }: { children: RenderWithCategory }) {
  return <>{children(useSearchParams().get("category"))}</>;
}

/**
 * Hands the current `?category=` slug to `children`.
 *
 * `useSearchParams` opts a statically prerendered page out of server rendering unless it sits inside a Suspense
 * boundary. The fallback here renders the same UI with no active category, so the links still ship in the
 * static HTML and only the highlight is filled in on the client.
 */
export function WithActiveCategory({ children }: { children: RenderWithCategory }) {
  return (
    <Suspense fallback={children(null)}>
      <ReadActiveCategory>{children}</ReadActiveCategory>
    </Suspense>
  );
}
