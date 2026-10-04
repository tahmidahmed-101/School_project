"use client";

import { useCallback } from "react";
import { BadgeCheck, Star } from "lucide-react";
import type { ApiReview, ApiReviewPage } from "@/lib/api/types";
import { useLang } from "@/lib/i18n";
import { fetchProductReviews } from "../../data/product-extras";
import { ListStatus, useShortDate } from "./ListStatus";
import { usePagedList } from "./usePagedList";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i < Math.round(rating) ? "fill-gold-400 text-gold-400" : "fill-ink-200 text-ink-300"}`}
        />
      ))}
    </span>
  );
}

/** Reviews from customers who received the product (the API only accepts reviews after a delivered order). */
export function ProductReviews({ slug }: { slug: string }) {
  const { ui, n } = useLang();
  const shortDate = useShortDate();
  const fetchPage = useCallback((page: number) => fetchProductReviews(slug, page), [slug]);
  const { items, lastPage, count, loading, failed, hasMore, loadMore, retry } = usePagedList<ApiReview, ApiReviewPage>(
    fetchPage,
  );
  const average = lastPage?.average_rating ?? null;

  return (
    <div className="space-y-3 pb-3 pt-3 text-xs leading-relaxed text-fg-muted">
      {average !== null && count > 0 && (
        <div className="flex items-center gap-2">
          <Stars rating={average} />
          <span className="font-bold text-fg">
            {n(average.toFixed(1))} {ui("reviewsOutOfFive")}
          </span>
          <span>({n(count)})</span>
        </div>
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-ink-100">
          {items.map((review) => (
            <li key={review.id} className="space-y-1 py-3 first:pt-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Stars rating={review.rating} />
                <span className="sr-only">
                  {n(review.rating)} {ui("reviewsOutOfFive")}
                </span>
                <span className="font-bold text-fg">{review.customer_name}</span>
                {review.is_verified_purchase && (
                  <span className="inline-flex items-center gap-1 font-semibold text-brand-800">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    {ui("reviewsVerified")}
                  </span>
                )}
                <span className="text-2xs">{shortDate(review.created_at)}</span>
              </div>
              {review.comment && <p className="whitespace-pre-line">{review.comment}</p>}
            </li>
          ))}
        </ul>
      )}

      {!loading && !failed && items.length === 0 && <p>{ui("reviewsEmpty")}</p>}

      <ListStatus loading={loading} failed={failed} hasMore={hasMore} onLoadMore={loadMore} onRetry={retry} />
    </div>
  );
}
