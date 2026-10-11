"use client";

import { useCallback, useState } from "react";
import { BadgeCheck, MessageSquare, Star } from "lucide-react";
import type { ApiReview, ApiReviewPage } from "@/lib/api/types";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/modules/auth";
import { fetchProductReviews } from "../../data/product-extras";
import { LoginPrompt } from "./customerAction";
import { ListStatus, useShortDate } from "./ListStatus";
import { ReviewForm } from "./ReviewForm";
import { usePagedList } from "./usePagedList";
import { ACCORDION_BODY } from "@/design-system/ui/AccordionItem";

const STARS = [5, 4, 3, 2, 1];

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
  // Bumped after a review is posted: remounting the panel reloads it from the first page with the new review.
  const [version, setVersion] = useState(0);

  return <ReviewPanel key={version} slug={slug} productId={productId} onPosted={() => setVersion((v) => v + 1)} />;
}

/** Rating summary | review form, with the reviews themselves full width below. */
function ReviewPanel({ slug, productId, onPosted }: { slug: string; productId: string; onPosted: () => void }) {
  const { ui, n } = useLang();
  const { status } = useAuth();
  const shortDate = useShortDate();
  const fetchPage = useCallback((page: number) => fetchProductReviews(slug, page), [slug]);
  const { items, lastPage, count, loading, failed, hasMore, loadMore, retry } = usePagedList<ApiReview, ApiReviewPage>(
    fetchPage,
  );
  const average = lastPage?.average_rating ?? 0;
  const counts = lastPage?.rating_counts ?? {};
  const share = (reviews: number) => (count > 0 ? Math.round((reviews / count) * 100) : 0);
  const recommended = share((counts["5"] ?? 0) + (counts["4"] ?? 0));

  return (
    <div className={`space-y-6 ${ACCORDION_BODY}`}>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-4">
            <span className="text-5xl font-bold leading-none text-gold-700">{n(average.toFixed(1))}</span>
            <div className="space-y-1">
              <p className="text-base font-semibold text-fg">{ui("reviewsAverage")}</p>
              <div className="flex items-center gap-2">
                <Stars rating={average} />
                <span className="whitespace-nowrap">
                  ({n(count)} {ui("reviewsCountLabel")})
                </span>
              </div>
            </div>
          </div>

          <p className="mt-3 flex items-baseline gap-1.5 text-base">
            <span className="text-xl font-bold text-fg">{n(recommended)}%</span>
            {ui("reviewsRecommended")}
          </p>

          <ul className="mt-4 space-y-2">
            {STARS.map((star) => {
              const percent = share(counts[String(star)] ?? 0);
              return (
                <li key={star} className="flex items-center gap-2">
                  <Stars rating={star} />
                  <span className="sr-only">
                    {n(star)} {ui("reviewsStars")}
                  </span>
                  <span className="h-2 max-w-40 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <span
                      className="block h-full rounded-full bg-gold-400 transition-all duration-500"
                      style={{ width: `${percent}%` }}
                    />
                  </span>
                  <span className="w-9 shrink-0 text-right">{n(percent)}%</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="lg:col-span-3">
          {status === "authenticated" ? (
            <ReviewForm productId={productId} onPosted={onPosted} />
          ) : (
            status === "guest" && (
              <div className="space-y-3">
                <p className="text-sm font-bold text-fg">{ui("reviewsWriteTitle")}</p>
                <LoginPrompt slug={slug} label={ui("reviewsLogin")} />
              </div>
            )
          )}
        </div>
      </div>

      {items.length > 0 && (
        <ul className="divide-y divide-ink-100 border-t border-ink-100">
          {items.map((review) => (
            <li key={review.id} className="space-y-1.5 py-3">
              {/* Stacked: who wrote it, then their stars, then what they said. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-base font-bold text-fg">{review.customer_name}</span>
                {review.is_verified_purchase && (
                  <span className="inline-flex items-center gap-1 font-semibold text-brand-800">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    {ui("reviewsVerified")}
                  </span>
                )}
                <span className="text-xs">{shortDate(review.created_at)}</span>
              </div>
              <div>
                <Stars rating={review.rating} />
                <span className="sr-only">
                  {n(review.rating)} {ui("reviewsOutOfFive")}
                </span>
              </div>
              {review.comment && <p className="whitespace-pre-line text-base">{review.comment}</p>}
              {review.images && review.images.length > 0 && (
                <ul className="flex flex-wrap gap-2 pt-1">
                  {review.images.map((src, i) => (
                    <li key={src}>
                      {/* Opens the full picture; the thumbnail is the customer's own upload, served as stored. */}
                      <a
                        href={src}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block h-20 w-20 overflow-hidden rounded-lg border border-ink-200 transition-opacity hover:opacity-80"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt={`${ui("reviewsPhotoAlt")} ${n(i + 1)}`}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {!loading && !failed && items.length === 0 && (
        <div className="rounded-lg bg-surface px-4 py-10 text-center">
          <MessageSquare className="mx-auto mb-2 h-8 w-8 text-ink-300" aria-hidden="true" />
          <p className="text-base">{ui("reviewsEmpty")}</p>
        </div>
      )}

      <ListStatus loading={loading} failed={failed} hasMore={hasMore} onLoadMore={loadMore} onRetry={retry} />
    </div>
  );
}
