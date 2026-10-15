"use client";

import { useLang } from "@/lib/i18n";
import { Loader } from "@/design-system/patterns/Loader";

interface ListStatusProps {
  loading: boolean;
  failed: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
}

/** Footer of an accordion list: spinner while a page loads, retry after a failure, otherwise "Show more". */
export function ListStatus({ loading, failed, hasMore, onLoadMore, onRetry }: ListStatusProps) {
  const { ui } = useLang();
  const linkClass = "cursor-pointer text-sm font-bold text-gold-800 hover:text-gold-900 hover:underline";

  if (loading) {
    return (
      <div role="status" className="flex items-center gap-2 text-sm text-fg-muted">
        <Loader variant="inline" />
        <span>{ui("loading")}</span>
      </div>
    );
  }
  if (failed) {
    return (
      <p className="text-sm text-fg-muted">
        {ui("loadFailed")}{" "}
        <button type="button" onClick={onRetry} className={linkClass}>
          {ui("tryAgain")}
        </button>
      </p>
    );
  }
  if (hasMore) {
    return (
      <button type="button" onClick={onLoadMore} className={linkClass}>
        {ui("loadMore")}
      </button>
    );
  }
  return null;
}

/** Shown in an accordion panel while its code is being fetched. */
export function PanelLoading() {
  const { ui } = useLang();
  return (
    <div role="status" className="flex items-center gap-2 pb-3 pt-3 text-sm text-fg-muted">
      <Loader variant="inline" />
      <span>{ui("loading")}</span>
    </div>
  );
}

/** "12 Mar 2026" / "১২ মার্চ, ২০২৬" from an API timestamp. */
export function useShortDate(): (iso: string) => string {
  const { lang } = useLang();
  return (iso) =>
    new Date(iso).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
}
