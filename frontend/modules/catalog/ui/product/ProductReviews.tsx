"use client";

import { useCallback, useState } from "react";
import { BadgeCheck, Star } from "lucide-react";
import type { ApiReview, ApiReviewPage } from "@/lib/api/types";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/modules/auth";
import { fetchProductReviews } from "../../data/product-extras";
import { LoginPrompt } from "./customerAction";
import { ListStatus, useShortDate } from "./ListStatus";
import { ReviewForm } from "./ReviewForm";
import { usePagedList } from "./usePagedList";
import { ACCORDION_BODY } from "@/design-system/ui/AccordionItem";

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

/**
 * Reviews from customers who received the product, plus the form to add one. The API only accepts a review from a
 * customer with a delivered order of the product, so every review shown is a verified purchase.
 */
export function ProductReviews({ slug, productId }: { slug: string; productId: string }) {
  const { ui } = useLang();
  const { status } = useAuth();
  // Bumped after a review is posted: remounting the list reloads it from the first page with the new review.
  const [version, setVersion] = useState(0);

  return (
    <div className={`space-y-4 ${ACCORDION_BODY}`}>
      <ReviewList key={version} slug={slug} />
      {status === "authenticated" ? (
        <ReviewForm productId={productId} onPosted={() => setVersion((v) => v + 1)} />
      ) : (
        status === "guest" && <LoginPrompt slug={slug} label={ui("reviewsLogin")} />
      )}
    </div>
  );
}

function ReviewList({ slug }: { slug: string }) {
  const { ui, n } = useLang();
  const shortDate = useShortDate();
  const fetchPage = useCallback((page: number) => fetchProductReviews(slug, page), [slug]);
  const { items, lastPage, count, loading, failed, hasMore, loadMore, retry } = usePagedList<ApiReview, ApiReviewPage>(
    fetchPage,
  );
  const average = lastPage?.average_rating ?? null;

  return (
    <div className="space-y-3">
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
            <li key={review.id} className="space-y-1.5 py-3 first:pt-0">
              {/* Stacked: who wrote it, then their stars, then what they said. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-sm font-bold text-fg">{review.customer_name}</span>
                {review.is_verified_purchase && (
                  <span className="inline-flex items-center gap-1 font-semibold text-brand-800">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    {ui("reviewsVerified")}
                  </span>
                )}
                <span className="text-2xs">{shortDate(review.created_at)}</span>
              </div>
              <div>
                <Stars rating={review.rating} />
                <span className="sr-only">
                  {n(review.rating)} {ui("reviewsOutOfFive")}
                </span>
              </div>
              {review.comment && <p className="whitespace-pre-line text-sm">{review.comment}</p>}
            </li>
          ))}
        </ul>
      )}

      {!loading && !failed && items.length === 0 && <p>{ui("reviewsEmpty")}</p>}

      <ListStatus loading={loading} failed={failed} hasMore={hasMore} onLoadMore={loadMore} onRetry={retry} />
    </div>
  );
}
