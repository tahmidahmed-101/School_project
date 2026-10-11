"use client";

import { useState, type FormEvent } from "react";
import { Star } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/modules/auth";
import { Button } from "@/design-system/ui/Button";
import { FormAlert, inputClass } from "@/design-system/ui/FormField";
import { reviewPath } from "../../data/product-extras";
import { SentNote, customerActionError, useCustomerSubmit } from "./customerAction";

const RATINGS = [1, 2, 3, 4, 5];

/**
 * Lets a logged-in customer rate and review the product. The backend decides who may post: only a customer whose
 * order of this product was delivered, once per product. Its refusals are shown as plain messages.
 */
export function ReviewForm({ productId, onPosted }: { productId: string; onPosted: () => void }) {
  const { ui, n } = useLang();
  const { authRequest } = useAuth();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const { error, setError, submitting, sent, clearSent, submit } = useCustomerSubmit();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (rating < 1) {
      setError(ui("reviewsRatingRequired"));
      return;
    }
    const ok = await submit(
      () => authRequest(reviewPath(productId), { method: "POST", body: { rating, comment: comment.trim() } }),
      (err) =>
        err instanceof ApiError && err.code === "purchase_required"
          ? ui("reviewsPurchaseRequired")
          : customerActionError(err, ui, ui("reviewsDuplicate")),
    );
    if (ok) {
      setRating(0);
      setComment("");
      onPosted();
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-2">
      <p className="text-sm font-bold text-fg">{ui("reviewsWriteTitle")}</p>
      {sent && <SentNote>{ui("reviewsSent")}</SentNote>}
      {error && <FormAlert>{error}</FormAlert>}

      <textarea
        id="product-review"
        aria-label={ui("reviewsCommentLabel")}
        rows={3}
        maxLength={2000}
        value={comment}
        onChange={(e) => {
          setComment(e.target.value);
          clearSent();
        }}
        placeholder={ui("reviewsCommentPlaceholder")}
        className={inputClass({ padding: "px-3 py-2", className: "resize-y text-sm" })}
      />
      {/* Rating on the left, submit on the right */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div role="radiogroup" aria-label={ui("reviewsRatingLabel")} className="flex items-center gap-1">
          {RATINGS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${n(value)} ${ui("reviewsStars")}`}
              onClick={() => {
                setRating(value);
                clearSent();
              }}
              className="cursor-pointer rounded p-0.5 transition-transform hover:scale-110"
            >
              <Star
                className={`h-6 w-6 ${value <= rating ? "fill-gold-400 text-gold-400" : "fill-ink-100 text-ink-300"}`}
              />
            </button>
          ))}
        </div>
        <Button type="submit" size="sm" loading={submitting}>
          {ui("reviewsSubmit")}
        </Button>
      </div>
    </form>
  );
}
