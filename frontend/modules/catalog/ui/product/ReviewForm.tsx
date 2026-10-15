"use client";

import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { ImagePlus, Star, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/modules/auth";
import { Button } from "@/design-system/ui/Button";
import { FormAlert, inputClass } from "@/design-system/ui/FormField";
import { acceptReviewPhotos, reviewFormData, reviewPath, type PhotoRefusal } from "../../data/product-extras";
import { SentNote, customerActionError, useCustomerSubmit } from "./customerAction";

const RATINGS = [1, 2, 3, 4, 5];

const PHOTO_REFUSALS = {
  tooMany: "reviewsPhotosTooMany",
  tooLarge: "reviewsPhotosTooLarge",
  notImage: "reviewsPhotosNotImage",
} as const satisfies Record<PhotoRefusal, string>;

/** A chosen photo with the object URL its thumbnail is shown from. */
type Photo = { file: File; url: string };

/**
 * Lets a logged-in customer rate and review the product. The backend decides who may post: only a customer whose
 * order of this product was delivered, once per product. Its refusals are shown as plain messages.
 */
export function ReviewForm({ productId, onPosted }: { productId: string; onPosted: () => void }) {
  const { ui, n } = useLang();
  const { authRequest } = useAuth();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { error, setError, submitting, sent, clearSent, submit } = useCustomerSubmit();

  // Thumbnails are object URLs, which the browser keeps until told otherwise.
  const shown = useRef<Photo[]>([]);
  useEffect(() => {
    shown.current = photos;
  }, [photos]);
  useEffect(() => () => shown.current.forEach((photo) => URL.revokeObjectURL(photo.url)), []);

  const addPhotos = (files: File[]) => {
    const { accepted, refusal } = acceptReviewPhotos(photos.length, files);
    setError(refusal ? ui(PHOTO_REFUSALS[refusal]) : "");
    clearSent();
    if (accepted.length > 0) {
      setPhotos([...photos, ...accepted.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    }
  };

  const removePhoto = (photo: Photo) => {
    URL.revokeObjectURL(photo.url);
    setPhotos(photos.filter((p) => p !== photo));
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addPhotos(Array.from(e.dataTransfer.files));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (rating < 1) {
      setError(ui("reviewsRatingRequired"));
      return;
    }
    const ok = await submit(
      () =>
        photos.length > 0
          ? authRequest(reviewPath(productId), {
              method: "POST",
              body: reviewFormData(
                rating,
                comment.trim(),
                photos.map((photo) => photo.file),
              ),
              // Photos from a phone take longer to send than the default allows.
              timeoutMs: 60_000,
            })
          : authRequest(reviewPath(productId), { method: "POST", body: { rating, comment: comment.trim() } }),
      (err) =>
        err instanceof ApiError && err.code === "purchase_required"
          ? ui("reviewsPurchaseRequired")
          : customerActionError(err, ui, ui("reviewsDuplicate")),
    );
    if (ok) {
      setRating(0);
      setComment("");
      photos.forEach((photo) => URL.revokeObjectURL(photo.url));
      setPhotos([]);
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
      <div
        role="button"
        tabIndex={0}
        aria-label={ui("reviewsPhotosLabel")}
        onClick={() => fileInput.current?.click()}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          fileInput.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-3 py-4 text-center transition-colors ${
          dragging ? "border-gold-400 bg-gold-50" : "border-ink-200 bg-canvas hover:border-gold-400"
        }`}
      >
        <ImagePlus className="h-5 w-5 text-fg-muted" />
        <span className="text-sm font-semibold text-fg">{ui("reviewsPhotosDrop")}</span>
        <span className="text-xs text-fg-muted">{ui("reviewsPhotosHint")}</span>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addPhotos(Array.from(e.target.files ?? []));
            // So choosing the same file again after removing it still fires a change.
            e.target.value = "";
          }}
        />
      </div>
      {photos.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {photos.map((photo) => (
            <li key={photo.url} className="relative h-16 w-16 overflow-hidden rounded-lg border border-ink-200">
              {/* A local preview of a file the customer just picked: nothing for next/image to optimise. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={photo.file.name} className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label={`${ui("reviewsPhotoRemove")}: ${photo.file.name}`}
                onClick={() => removePhoto(photo)}
                className="absolute right-0.5 top-0.5 cursor-pointer rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
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
