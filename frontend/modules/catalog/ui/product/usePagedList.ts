"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiPage } from "@/lib/api/types";

interface PagedList<Item, Page> {
  items: Item[];
  /** The latest page as returned, for extra fields such as a review summary. */
  lastPage: Page | null;
  count: number;
  loading: boolean;
  failed: boolean;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
}

/**
 * Loads a paginated API list a page at a time, starting when the component mounts (an accordion mounts its content
 * only when opened, so nothing is fetched for a closed one). `fetchPage` must be stable (wrap it in useCallback).
 */
export function usePagedList<Item, Page extends ApiPage<Item> = ApiPage<Item>>(
  fetchPage: (page: number) => Promise<Page>,
): PagedList<Item, Page> {
  const [items, setItems] = useState<Item[]>([]);
  const [lastPage, setLastPage] = useState<Page | null>(null);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Pages already merged into `items`, so a re-run effect (Strict Mode, retry) cannot append one twice.
  const merged = useRef(new Set<number>());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetchPage(page)
      .then((data) => {
        if (cancelled) return;
        if (!merged.current.has(page)) {
          merged.current.add(page);
          setItems((prev) => [...prev, ...data.results]);
        }
        setLastPage(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage, page, attempt]);

  const loadMore = useCallback(() => setPage((p) => p + 1), []);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  return {
    items,
    lastPage,
    count: lastPage?.count ?? 0,
    loading,
    failed,
    hasMore: Boolean(lastPage?.next) && !failed,
    loadMore,
    retry,
  };
}
