"use client";

import { useState, type FormEvent } from "react";
import { Star } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/modules/auth";
import { Button } from "@/design-system/ui/Button";
import { FormAlert, inputClass } from "@/design-system/ui/FormField";
import { reviewPath } from "../../data/product-extras";
import { SentNote, customerActionError } from "./customerAction";

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
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (rating < 1) {
      setError(ui("reviewsRatingRequired"));
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await authRequest(reviewPath(productId), { method: "POST", body: { rating, comment: comment.trim() } });
      setRating(0);
      setComment("");
      setSent(true);
      onPosted();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "purchase_required"
          ? ui("reviewsPurchaseRequired")
          : customerActionError(err, ui, ui("reviewsDuplicate")),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-2 border-t border-ink-100 pt-4">
      <p className="text-xs font-bold text-fg">{ui("reviewsWriteTitle")}</p>
      {sent && <SentNote>{ui("reviewsSent")}</SentNote>}
      {error && <FormAlert>{error}</FormAlert>}

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
              setSent(false);
            }}
            className="cursor-pointer rounded p-0.5 transition-transform hover:scale-110"
          >
            <Star
              className={`h-6 w-6 ${value <= rating ? "fill-gold-400 text-gold-400" : "fill-ink-100 text-ink-300"}`}
            />
          </button>
        ))}
      </div>

      <label htmlFor="product-review" className="block text-xs font-semibold text-fg">
        {ui("reviewsCommentLabel")}
      </label>
      <textarea
        id="product-review"
        rows={3}
        maxLength={2000}
        value={comment}
        onChange={(e) => {
          setComment(e.target.value);
          setSent(false);
        }}
        placeholder={ui("reviewsCommentPlaceholder")}
        className={inputClass({ padding: "px-3 py-2", className: "resize-y text-xs" })}
      />
      <Button type="submit" size="sm" loading={submitting}>
        {ui("reviewsSubmit")}
      </Button>
    </form>
  );
}
