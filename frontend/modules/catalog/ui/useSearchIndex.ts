"use client";

import { useCallback, useState } from "react";
import type { SearchEntry } from "@/lib/product";

/** One request per page load, shared by the desktop and mobile search boxes. */
let pending: Promise<SearchEntry[]> | null = null;

function loadIndex(): Promise<SearchEntry[]> {
  pending ??= fetch("/api/search-index")
    .then((res) => (res.ok ? (res.json() as Promise<SearchEntry[]>) : []))
    .catch(() => []);
  return pending;
}

/** Search entries, fetched lazily: call `load()` when the shopper focuses a search box. */
export function useSearchIndex(): { entries: SearchEntry[]; load: () => void } {
  const [entries, setEntries] = useState<SearchEntry[]>([]);
  const load = useCallback(() => {
    void loadIndex().then(setEntries);
  }, []);
  return { entries, load };
}
